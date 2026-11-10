"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RealtimeEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
  error?: { message?: string };
  response?: { status?: string };
};

type PendingTranscript = { resolve: (text: string) => void; timer: number };
type PendingSpeech = { resolve: () => void; timer: number };

export function useRealtimeInterview(stream: MediaStream, language: string, enabled: boolean) {
  const [status, setStatus] = useState<"off" | "connecting" | "ready" | "error">(enabled ? "connecting" : "off");
  const [transcript, setTranscript] = useState("");
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finalTranscriptRef = useRef("");
  const liveTranscriptRef = useRef("");
  const pendingTranscriptRef = useRef<PendingTranscript | null>(null);
  const pendingSpeechRef = useRef<PendingSpeech | null>(null);

  const send = useCallback((event: object) => {
    if (dcRef.current?.readyState !== "open") throw new Error("Realtime voice is not ready.");
    dcRef.current.send(JSON.stringify(event));
  }, []);

  const disconnect = useCallback(() => {
    pendingTranscriptRef.current && window.clearTimeout(pendingTranscriptRef.current.timer);
    pendingSpeechRef.current && window.clearTimeout(pendingSpeechRef.current.timer);
    pendingTranscriptRef.current = null; pendingSpeechRef.current = null;
    dcRef.current?.close(); pcRef.current?.close(); audioRef.current?.remove();
    dcRef.current = null; pcRef.current = null; audioRef.current = null;
  }, []);

  useEffect(() => {
    if (!enabled) { setStatus("off"); return; }
    let cancelled = false;
    async function connect() {
      setStatus("connecting");
      try {
        const tokenResponse = await fetch("/api/realtime/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ language }) });
        const token = await tokenResponse.json();
        if (!tokenResponse.ok || !token.value) throw new Error(token.error || "Could not start Realtime voice.");
        const pc = new RTCPeerConnection(); pcRef.current = pc;
        const audio = document.createElement("audio"); audio.autoplay = true; audioRef.current = audio;
        pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };
        const track = stream.getAudioTracks()[0];
        if (!track) throw new Error("No microphone track is available.");
        pc.addTrack(track, stream);
        const dc = pc.createDataChannel("oai-events"); dcRef.current = dc;
        dc.onmessage = (message) => {
          const event = JSON.parse(message.data) as RealtimeEvent;
          if (event.type === "conversation.item.input_audio_transcription.delta" && event.delta) {
            liveTranscriptRef.current += event.delta;
            setTranscript(liveTranscriptRef.current);
          }
          if (event.type === "conversation.item.input_audio_transcription.completed") {
            const text = (event.transcript || "").trim(); finalTranscriptRef.current = text; setTranscript(text);
            const pending = pendingTranscriptRef.current;
            if (pending) { window.clearTimeout(pending.timer); pendingTranscriptRef.current = null; pending.resolve(text); }
          }
          if (event.type === "response.done") {
            const pending = pendingSpeechRef.current;
            if (pending) { window.clearTimeout(pending.timer); pendingSpeechRef.current = null; pending.resolve(); }
          }
          if (event.type === "error") setStatus("error");
        };
        const opened = new Promise<void>((resolve, reject) => { dc.onopen = () => resolve(); dc.onerror = () => reject(new Error("Realtime data channel failed.")); });
        const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
        const answerResponse = await fetch("https://api.openai.com/v1/realtime/calls", { method: "POST", headers: { Authorization: `Bearer ${token.value}`, "Content-Type": "application/sdp" }, body: offer.sdp });
        if (!answerResponse.ok) throw new Error(await answerResponse.text());
        await pc.setRemoteDescription({ type: "answer", sdp: await answerResponse.text() });
        await opened;
        if (!cancelled) setStatus("ready");
      } catch { if (!cancelled) setStatus("error"); }
    }
    void connect();
    return () => { cancelled = true; disconnect(); };
  }, [disconnect, enabled, language, stream]);

  const beginTurn = useCallback(() => {
    finalTranscriptRef.current = ""; liveTranscriptRef.current = ""; setTranscript("");
    send({ type: "input_audio_buffer.clear" });
    stream.getAudioTracks().forEach((track) => { track.enabled = true; });
  }, [send, stream]);

  const finishTurn = useCallback(() => new Promise<string>((resolve) => {
    stream.getAudioTracks().forEach((track) => { track.enabled = false; });
    const timer = window.setTimeout(() => { pendingTranscriptRef.current = null; resolve(finalTranscriptRef.current.trim()); }, 6000);
    pendingTranscriptRef.current = { resolve, timer };
    send({ type: "input_audio_buffer.commit" });
  }), [send, stream]);

  const speakText = useCallback((text: string) => new Promise<void>((resolve) => {
    if (!text) { resolve(); return; }
    const timer = window.setTimeout(() => { pendingSpeechRef.current = null; resolve(); }, 30000);
    pendingSpeechRef.current = { resolve, timer };
    send({
      type: "response.create",
      response: {
        output_modalities: ["audio"],
        instructions: `Say exactly the interviewer text below and nothing else. Preserve its wording and speak naturally.\n\n${text}`
      }
    });
  }), [send]);

  return { status, ready: status === "ready", transcript, beginTurn, finishTurn, speakText, disconnect };
}
