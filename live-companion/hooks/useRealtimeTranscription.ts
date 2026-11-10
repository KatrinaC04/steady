"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// FR-4: streams any audio MediaStream (shared tab, screen, or microphone) to a transcription-only Realtime
// session over WebRTC. Captions live with the caller, so a reconnect never clears what is on screen.

export type TranscriptionStatus = "off" | "connecting" | "ready" | "reconnecting" | "error";
export type TranscriptionErrorCode = "not-configured" | "connect-failed" | "gave-up";

export type TranscriptionHandlers = {
  onSpeechStarted(itemId: string): void;
  onSpeechStopped(itemId: string): void;
  onDelta(itemId: string, delta: string): void;
  onCompleted(itemId: string, transcript: string): void;
  onFailed(itemId: string): void;
};

type RealtimeEvent = { type?: string; item_id?: string; delta?: string; transcript?: string; error?: { message?: string } };

const MAX_RECONNECTS = 5;

export function useRealtimeTranscription(options: { stream: MediaStream | null; enabled: boolean; language: string; silenceMs: number; source: string; handlers: TranscriptionHandlers }) {
  const { stream, enabled, language, silenceMs, source } = options;
  const [status, setStatus] = useState<TranscriptionStatus>("off");
  const [error, setError] = useState<{ code: TranscriptionErrorCode; message: string } | null>(null);
  const [reconnects, setReconnects] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const handlersRef = useRef(options.handlers);
  handlersRef.current = options.handlers;

  const retry = useCallback(() => { setError(null); setReconnects(0); setAttempt((value) => value + 1); }, []);

  useEffect(() => {
    if (!enabled || !stream) { setStatus("off"); return; }
    const track = stream.getAudioTracks()[0];
    if (!track) { setStatus("error"); setError({ code: "connect-failed", message: "No audio track to transcribe." }); return; }

    let disposed = false;
    let pc: RTCPeerConnection | null = null;
    let dc: RTCDataChannel | null = null;
    let retryTimer: number | undefined;
    let failures = 0;

    const teardown = () => { dc?.close(); pc?.close(); dc = null; pc = null; };

    const scheduleReconnect = () => {
      if (disposed) return;
      teardown();
      failures += 1;
      setReconnects((value) => value + 1);
      if (failures > MAX_RECONNECTS) { setStatus("error"); setError({ code: "gave-up", message: "Transcription kept disconnecting." }); return; }
      setStatus("reconnecting");
      retryTimer = window.setTimeout(connect, Math.min(8000, 500 * 2 ** (failures - 1)));
    };

    async function connect() {
      if (disposed) return;
      setStatus((current) => (current === "reconnecting" ? current : "connecting"));
      try {
        const tokenResponse = await fetch("/api/realtime/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language, silenceMs, source }) });
        const token = await tokenResponse.json().catch(() => ({}));
        if (tokenResponse.status === 503 && token.code === "not-configured") {
          setStatus("error"); setError({ code: "not-configured", message: token.error }); return;
        }
        if (!tokenResponse.ok || !token.value) throw new Error(token.error || "Could not start transcription.");
        if (disposed) return;

        const peer = new RTCPeerConnection(); pc = peer;
        peer.addTrack(track, stream!);
        const channel = peer.createDataChannel("oai-events"); dc = channel;
        channel.onmessage = (message) => {
          let event: RealtimeEvent;
          try { event = JSON.parse(message.data); } catch { return; }
          const handlers = handlersRef.current;
          const id = event.item_id || "";
          if (event.type === "input_audio_buffer.speech_started") handlers.onSpeechStarted(id);
          else if (event.type === "input_audio_buffer.speech_stopped") handlers.onSpeechStopped(id);
          else if (event.type === "conversation.item.input_audio_transcription.delta" && event.delta) handlers.onDelta(id, event.delta);
          else if (event.type === "conversation.item.input_audio_transcription.completed") handlers.onCompleted(id, event.transcript || "");
          else if (event.type === "conversation.item.input_audio_transcription.failed") handlers.onFailed(id);
        };
        const opened = new Promise<void>((resolve, reject) => {
          channel.onopen = () => resolve();
          channel.onerror = () => reject(new Error("Realtime data channel failed."));
        });
        channel.onclose = () => { if (!disposed && pc === peer) scheduleReconnect(); };
        peer.onconnectionstatechange = () => {
          if (!disposed && pc === peer && (peer.connectionState === "failed" || peer.connectionState === "disconnected")) scheduleReconnect();
        };

        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        const answer = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/sdp" }, body: offer.sdp });
        if (!answer.ok) throw new Error(`Realtime call failed (${answer.status}).`);
        await peer.setRemoteDescription({ type: "answer", sdp: await answer.text() });
        await opened;
        if (disposed) return;
        failures = 0;
        setError(null);
        setStatus("ready");
      } catch {
        scheduleReconnect();
      }
    }

    void connect();
    return () => { disposed = true; window.clearTimeout(retryTimer); teardown(); };
  }, [enabled, stream, language, silenceMs, source, attempt]);

  return { status, error, reconnects, retry };
}
