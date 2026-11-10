import { describe, expect, it } from "vitest";
import { browserProfile, captureErrorHelp, inspectCapturedStream, type CaptureErrorCode } from "@/lib/live/capture";
import { initialCompanionState, type Question } from "@/lib/live/companion-reducer";
import { buildReview, median, questionLatency } from "@/lib/live/metrics";
import { realtimeSessionConfig } from "@/lib/live/realtime-session";

const stream = (kinds: string[]) => ({ getAudioTracks: () => kinds.filter((kind) => kind === "audio").map((kind) => ({ kind })), getTracks: () => kinds.map(() => ({ stop() {} })) });
const MAC_CHROME = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const WIN_EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0";

describe("capture", () => {
  it("rejects a share without an audio track instead of pretending to listen", () => {
    expect(inspectCapturedStream(stream(["video"]))).toEqual({ ok: false, code: "no-audio-track" });
    expect(inspectCapturedStream(stream(["video", "audio"]))).toEqual({ ok: true });
  });

  it("knows which browsers can share meeting audio", () => {
    expect(browserProfile(MAC_CHROME)).toMatchObject({ chromium: true, mac: true, tabAudio: true, systemAudio: false });
    expect(browserProfile(MAC_SAFARI)).toMatchObject({ chromium: false, tabAudio: false });
    expect(browserProfile(WIN_EDGE)).toMatchObject({ chromium: true, systemAudio: true });
  });

  it.each(["no-audio-track", "unsupported", "permission-denied", "cancelled", "no-device", "unknown"] as CaptureErrorCode[])("gives next steps for %s", (code) => {
    const help = captureErrorHelp(code, browserProfile(MAC_CHROME));
    expect(help.title).toBeTruthy();
    expect(help.steps.length).toBeGreaterThan(0);
  });

  it("points macOS users at Teams on the web when the share has no audio", () => {
    expect(captureErrorHelp("no-audio-track", browserProfile(MAC_CHROME)).steps.join(" ")).toMatch(/Teams on the web/);
    expect(captureErrorHelp("unsupported", browserProfile(MAC_SAFARI)).message).toMatch(/Safari/);
  });
});

describe("realtimeSessionConfig", () => {
  it("never lets the model respond and uses server VAD", () => {
    const config = realtimeSessionConfig({ language: "English", source: "tab" });
    expect(config.audio.input.turn_detection).toMatchObject({ type: "server_vad", create_response: false, interrupt_response: false, silence_duration_ms: 600 });
    expect(config.audio.input.transcription).toMatchObject({ language: "en" });
    expect(config.audio.input.noise_reduction).toBeNull();
  });

  it("maps languages, clamps the silence window, and denoises only microphones", () => {
    expect(realtimeSessionConfig({ language: "中文" }).audio.input.transcription).toMatchObject({ language: "zh" });
    expect(realtimeSessionConfig({ language: "Bilingual" }).audio.input.transcription).not.toHaveProperty("language");
    expect(realtimeSessionConfig({ silenceMs: 50 }).audio.input.turn_detection.silence_duration_ms).toBe(400);
    expect(realtimeSessionConfig({ silenceMs: 99999 }).audio.input.turn_detection.silence_duration_ms).toBe(1200);
    expect(realtimeSessionConfig({ source: "microphone" }).audio.input.noise_reduction).toEqual({ type: "far_field" });
  });
});

describe("metrics", () => {
  const question: Question = { seq: 1, text: "Why Microsoft?", trigger: "auto", committedAt: 2000, speechStoppedAt: 1600, finalAt: 1900, status: "active" };

  it("times each stage from the estimated end of speech", () => {
    expect(questionLatency(question, { status: "done", startedAt: 2000, doneAt: 2050 }, 600)).toEqual({ asrFinalMs: 900, detectMs: 1000, searchMs: 50, totalMs: 1050 });
    expect(questionLatency({ ...question, trigger: "manual" }, { status: "done", startedAt: 2000, doneAt: 2040 }, 600)).toEqual({ searchMs: 40, totalMs: 40 });
  });

  it("computes medians", () => {
    expect(median([])).toBeUndefined();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it("builds a review with timings and matches but no audio or answer bodies", () => {
    const state = { ...initialCompanionState(), questions: [question], segments: [{ id: "a", text: "Why Microsoft?", final: true, startedAt: 0, role: "question" as const }] };
    const response = { results: [{ questionId: "msft-reported-15", attemptedQuestion: "Why Microsoft, and why this role now?", score: 0.7 }], confident: true } as never;
    const review = buildReview(state, { 1: { status: "done", startedAt: 2000, doneAt: 2050, response } }, { language: "English", source: "tab", vadSilenceMs: 600, startedAt: "2026-10-18T00:00:00.000Z" });
    expect(review.questions[0]).toMatchObject({ text: "Why Microsoft?", confident: true, matches: [{ questionId: "msft-reported-15", score: 0.7 }], latencyMs: { totalMs: 1050 } });
    expect(review.captions).toEqual([{ text: "Why Microsoft?", role: "question" }]);
  });
});
