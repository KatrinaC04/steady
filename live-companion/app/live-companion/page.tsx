"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useAudioLevel } from "@/hooks/useAudioLevel";
import { useCompanionSearch } from "@/hooks/useCompanionSearch";
import { useRealtimeTranscription, type TranscriptionHandlers } from "@/hooks/useRealtimeTranscription";
import { CaptureError, browserProfile, captureErrorHelp, requestMeetingAudio, setStreamPaused, stopStream, type AudioSource, type CaptureErrorCode } from "@/lib/live/capture";
import { companionReducer, initialCompanionState } from "@/lib/live/companion-reducer";
import { buildReview } from "@/lib/live/metrics";
import { VAD_SILENCE_RANGE, type CompanionLanguage } from "@/lib/live/realtime-session";
import { LivePanel } from "./LivePanel";
import { ReviewPanel } from "./ReviewPanel";
import { SetupPanel, type IndexSummary } from "./SetupPanel";

type Phase = "setup" | "live" | "review";
const TICK_MS = 100;

export default function LiveCompanionPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [index, setIndex] = useState<IndexSummary | null | "error">(null);
  const [source, setSource] = useState<AudioSource>("tab");
  const [language, setLanguage] = useState<CompanionLanguage>("English");
  const [silenceMs, setSilenceMs] = useState<number>(VAD_SILENCE_RANGE.default);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [captureError, setCaptureError] = useState<CaptureErrorCode | null>(null);
  const [consent, setConsent] = useState(false);
  const [paused, setPaused] = useState(false);
  const [endedByShare, setEndedByShare] = useState(false);
  const [userAgent, setUserAgent] = useState("");
  const startedAt = useRef("");
  const [state, dispatch] = useReducer(companionReducer, undefined, () => initialCompanionState());

  const level = useAudioLevel(phase === "setup" ? stream : null);
  const search = useCompanionSearch(state, language);
  const handlers = useMemo<TranscriptionHandlers>(() => ({
    onSpeechStarted: (itemId) => dispatch({ type: "speechStarted", itemId, now: performance.now() }),
    onSpeechStopped: (itemId) => dispatch({ type: "speechStopped", itemId, now: performance.now() }),
    onDelta: (itemId, delta) => dispatch({ type: "delta", itemId, delta, now: performance.now() }),
    onCompleted: (itemId, transcript) => dispatch({ type: "completed", itemId, transcript, now: performance.now() }),
    onFailed: (itemId) => dispatch({ type: "transcriptionFailed", itemId, now: performance.now() }),
  }), []);
  const transcription = useRealtimeTranscription({ stream, enabled: phase === "live", language, silenceMs, source, handlers });

  useEffect(() => {
    setUserAgent(navigator.userAgent);
    fetch("/api/best-answers/index").then((response) => (response.ok ? response.json() : Promise.reject())).then(setIndex).catch(() => setIndex("error"));
  }, []);

  // Silence-window and finalization timers advance on ticks while live.
  useEffect(() => {
    if (phase !== "live") return;
    const timer = window.setInterval(() => dispatch({ type: "tick", now: performance.now() }), TICK_MS);
    return () => window.clearInterval(timer);
  }, [phase]);

  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  // The browser's own "Stop sharing" button ends the tracks; never keep showing a capture that has stopped.
  useEffect(() => {
    if (!stream) return;
    const onEnded = () => {
      setStream(null);
      if (phaseRef.current === "live") { setEndedByShare(true); setPhase("review"); }
    };
    const tracks = stream.getTracks();
    tracks.forEach((track) => track.addEventListener("ended", onEnded));
    return () => tracks.forEach((track) => track.removeEventListener("ended", onEnded));
  }, [stream]);

  const streamRef = useRef<MediaStream | null>(null);
  streamRef.current = stream;
  useEffect(() => () => stopStream(streamRef.current), []);

  const share = useCallback(async () => {
    setRequesting(true); setCaptureError(null);
    try {
      setStream(await requestMeetingAudio(source));
    } catch (error) {
      setCaptureError(error instanceof CaptureError ? error.code : "unknown");
    } finally {
      setRequesting(false);
    }
  }, [source]);

  const stopShare = useCallback(() => { stopStream(stream); setStream(null); }, [stream]);

  const start = useCallback(() => {
    startedAt.current = new Date().toISOString();
    dispatch({ type: "reset" });
    search.reset();
    setPaused(false); setEndedByShare(false);
    setPhase("live");
  }, [search]);

  const stop = useCallback(() => { stopStream(stream); setStream(null); setPhase("review"); }, [stream]);

  const togglePause = useCallback((value: boolean) => { setStreamPaused(stream, value); setPaused(value); }, [stream]);

  const download = useCallback(() => {
    const review = buildReview(state, search.records, { language, source, vadSilenceMs: silenceMs, startedAt: startedAt.current });
    const url = URL.createObjectURL(new Blob([JSON.stringify(review, null, 2)], { type: "application/json" }));
    const link = Object.assign(document.createElement("a"), { href: url, download: `mock-review-${startedAt.current.slice(0, 16).replace(/[:T]/g, "-")}.json` });
    link.click();
    URL.revokeObjectURL(url);
  }, [state, search.records, language, source, silenceMs]);

  const restart = useCallback(() => {
    dispatch({ type: "reset" });
    search.reset();
    setConsent(false);
    setPhase("setup");
  }, [search]);

  if (phase === "live") {
    return (
      <LivePanel
        state={state}
        records={search.records}
        draft={search.draft}
        paused={paused}
        transcription={transcription}
        vadSilenceMs={silenceMs}
        onPause={() => togglePause(true)}
        onResume={() => togglePause(false)}
        onStop={stop}
        onSearchNow={() => dispatch({ type: "manualCommit", now: performance.now() })}
        onResearch={search.research}
        onDismiss={(seq) => dispatch({ type: "dismiss", seq })}
        onTyped={(text) => dispatch({ type: "typedQuestion", text, now: performance.now() })}
      />
    );
  }

  if (phase === "review") {
    return <ReviewPanel state={state} records={search.records} vadSilenceMs={silenceMs} endedByShare={endedByShare} onDownload={download} onRestart={restart} />;
  }

  const label = stream ? stream.getVideoTracks()[0]?.label || stream.getAudioTracks()[0]?.label || "" : "";
  return (
    <SetupPanel
      index={index}
      source={source}
      onSource={setSource}
      language={language}
      onLanguage={setLanguage}
      silenceMs={silenceMs}
      onSilence={setSilenceMs}
      sharing={stream ? { label, level } : null}
      captureHelp={captureError ? captureErrorHelp(captureError, browserProfile(userAgent)) : null}
      requesting={requesting}
      consent={consent}
      onConsent={setConsent}
      onShare={share}
      onStopShare={stopShare}
      onStart={start}
    />
  );
}
