// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompanionSearch } from "@/hooks/useCompanionSearch";
import { useRealtimeTranscription, type TranscriptionHandlers } from "@/hooks/useRealtimeTranscription";
import { companionReducer, initialCompanionState, type CompanionEvent, type CompanionState } from "@/lib/live/companion-reducer";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const run = (events: CompanionEvent[], state: CompanionState = initialCompanionState()) => events.reduce(companionReducer, state);
const searchResponse = (questionId: string) => ({ results: [{ questionId, attemptedQuestion: questionId, score: 0.5 }], confident: true, threshold: 0.2, detectedThemes: [], latencyMs: 1 });

describe("useCompanionSearch", () => {
  it("aborts an unfinished search when a new question arrives, and only the new one lands", async () => {
    const calls: { query: string; signal: AbortSignal; resolve(value: unknown): void }[] = [];
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((resolve) => {
      calls.push({ query: JSON.parse(init.body as string).query, signal: init.signal!, resolve: (body) => resolve(new Response(JSON.stringify(body))) });
    })));

    const first = run([{ type: "typedQuestion", text: "Tell me about a conflict.", now: 0 }]);
    const { result, rerender } = renderHook(({ state }) => useCompanionSearch(state, "English"), { initialProps: { state: first } });
    expect(result.current.records[1].status).toBe("loading");

    const second = run([{ type: "typedQuestion", text: "Why Microsoft?", now: 10 }], first);
    rerender({ state: second });
    expect(calls.map((call) => [call.query, call.signal.aborted])).toEqual([["Tell me about a conflict.", true], ["Why Microsoft?", false]]);

    await act(async () => { calls[1].resolve(searchResponse("msft-reported-15")); });
    await waitFor(() => expect(result.current.records[2].status).toBe("done"));
    expect(result.current.records[2].response?.results[0].questionId).toBe("msft-reported-15");
    expect(result.current.records[1].status).toBe("loading");
    // The first question's context is passed along with the second search.
    expect(JSON.parse((vi.mocked(fetch).mock.calls[1][1] as RequestInit).body as string).conversationContext).toEqual(["Tell me about a conflict."]);
  });

  it("keeps prefetch results apart from the formal result", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      const query = JSON.parse(init.body as string).query as string;
      return new Response(JSON.stringify(searchResponse(query.startsWith("Why") ? "formal" : "draft")));
    }));
    const committed = run([{ type: "typedQuestion", text: "Why Microsoft?", now: 0 }]);
    const { result, rerender } = renderHook(({ state }) => useCompanionSearch(state, "English"), { initialProps: { state: committed } });
    await waitFor(() => expect(result.current.records[1].status).toBe("done"));

    const speaking = run([{ type: "speechStarted", itemId: "b", now: 20000 }, { type: "delta", itemId: "b", delta: "Tell me about a time you led a team", now: 20100 }], committed);
    rerender({ state: speaking });
    await waitFor(() => expect(result.current.draft?.response.results[0].questionId).toBe("draft"));
    expect(result.current.records[1].response?.results[0].questionId).toBe("formal");
  });
});

// Minimal WebRTC fakes: enough for the hook's connect / message / close paths.
class FakeChannel {
  readyState = "connecting";
  onopen?: () => void; onclose?: () => void; onerror?: () => void; onmessage?: (message: { data: string }) => void;
  close() { this.readyState = "closed"; }
  emit(event: object) { this.onmessage?.({ data: JSON.stringify(event) }); }
}
class FakePeer {
  static instances: FakePeer[] = [];
  channel = new FakeChannel();
  connectionState = "new";
  onconnectionstatechange?: () => void;
  tracks: unknown[] = [];
  constructor() { FakePeer.instances.push(this); }
  addTrack(track: unknown) { this.tracks.push(track); }
  createDataChannel() { return this.channel; }
  async createOffer() { return { type: "offer", sdp: "offer-sdp" }; }
  async setLocalDescription() {}
  async setRemoteDescription() { queueMicrotask(() => { this.channel.readyState = "open"; this.channel.onopen?.(); }); }
  close() { this.connectionState = "closed"; }
}

const audioStream = (tracks: number) => ({ getAudioTracks: () => Array.from({ length: tracks }, () => ({ kind: "audio" })) }) as unknown as MediaStream;
const noopHandlers: TranscriptionHandlers = { onSpeechStarted() {}, onSpeechStopped() {}, onDelta() {}, onCompleted() {}, onFailed() {} };
const options = (stream: MediaStream, handlers = noopHandlers) => ({ stream, enabled: true, language: "English", silenceMs: 600, source: "tab", handlers });

function stubRealtime(tokenStatus = 200) {
  FakePeer.instances = [];
  vi.stubGlobal("RTCPeerConnection", FakePeer);
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/realtime/token") {
      return tokenStatus === 200 ? new Response(JSON.stringify({ value: "ek_test" })) : new Response(JSON.stringify({ error: "OpenAI API key is not configured.", code: "not-configured" }), { status: tokenStatus });
    }
    return new Response("answer-sdp");
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("useRealtimeTranscription", () => {
  it("never reports listening when the stream has no audio track", () => {
    const fetchMock = stubRealtime();
    const opts = options(audioStream(0));
    const { result } = renderHook(() => useRealtimeTranscription(opts));
    expect(result.current.status).toBe("error");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(FakePeer.instances).toHaveLength(0);
  });

  it("surfaces a missing API key without retrying", async () => {
    stubRealtime(503);
    const opts = options(audioStream(1));
    const { result } = renderHook(() => useRealtimeTranscription(opts));
    await waitFor(() => expect(result.current.error?.code).toBe("not-configured"));
    expect(result.current.status).toBe("error");
    expect(FakePeer.instances).toHaveLength(0);
  });

  it("forwards transcription events and reconnects after the channel drops", async () => {
    stubRealtime();
    const events: string[] = [];
    const handlers: TranscriptionHandlers = {
      onSpeechStarted: (id) => events.push(`start:${id}`),
      onSpeechStopped: (id) => events.push(`stop:${id}`),
      onDelta: (id, delta) => events.push(`delta:${id}:${delta}`),
      onCompleted: (id, text) => events.push(`done:${id}:${text}`),
      onFailed: (id) => events.push(`failed:${id}`),
    };
    const opts = options(audioStream(1), handlers);
    const { result } = renderHook(() => useRealtimeTranscription(opts));
    await waitFor(() => expect(result.current.status).toBe("ready"));

    const channel = FakePeer.instances[0].channel;
    act(() => {
      channel.emit({ type: "input_audio_buffer.speech_started", item_id: "i1" });
      channel.emit({ type: "conversation.item.input_audio_transcription.delta", item_id: "i1", delta: "Why" });
      channel.emit({ type: "input_audio_buffer.speech_stopped", item_id: "i1" });
      channel.emit({ type: "conversation.item.input_audio_transcription.completed", item_id: "i1", transcript: "Why Microsoft?" });
      channel.emit({ type: "conversation.item.input_audio_transcription.failed", item_id: "i2" });
    });
    expect(events).toEqual(["start:i1", "delta:i1:Why", "stop:i1", "done:i1:Why Microsoft?", "failed:i2"]);

    act(() => channel.onclose?.());
    expect(result.current.status).toBe("reconnecting");
    await waitFor(() => expect(result.current.status).toBe("ready"), { timeout: 3000 });
    expect(FakePeer.instances).toHaveLength(2);
    expect(result.current.reconnects).toBe(1);
  });
});
