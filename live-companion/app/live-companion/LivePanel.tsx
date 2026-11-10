"use client";

import { Pause, Play, RotateCw, Search, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { TranscriptionErrorCode, TranscriptionStatus } from "@/hooks/useRealtimeTranscription";
import type { DraftResult, SearchRecord } from "@/hooks/useCompanionSearch";
import { activeQuestion, bufferText, type CompanionState } from "@/lib/live/companion-reducer";
import { questionLatency } from "@/lib/live/metrics";
import { HelpBox } from "./SetupPanel";
import { ResultCards } from "./ResultCards";
import styles from "./live.module.css";

const TRANSCRIPTION_LABEL: Record<TranscriptionStatus, string> = { off: "Off", connecting: "Connecting…", ready: "Transcribing", reconnecting: "Reconnecting…", error: "Transcription error" };

const seconds = (ms?: number) => (ms === undefined ? "—" : `${(ms / 1000).toFixed(1)} s`);

type Props = {
  state: CompanionState;
  records: Record<number, SearchRecord>;
  draft: DraftResult | null;
  paused: boolean;
  transcription: { status: TranscriptionStatus; error: { code: TranscriptionErrorCode; message: string } | null; reconnects: number; retry(): void };
  vadSilenceMs: number;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  onSearchNow(): void;
  onResearch(): void;
  onDismiss(seq: number): void;
  onTyped(text: string): void;
};

function Captions({ state }: { state: CompanionState }) {
  const end = useRef<HTMLDivElement>(null);
  const visible = state.segments.filter((segment) => segment.text.trim());
  const lastText = visible[visible.length - 1]?.text;
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [visible.length, lastText]);
  return (
    <aside className={styles.captions} aria-label="Live captions" aria-live="polite">
      <span className={styles.label}>Interviewer captions</span>
      {!visible.length && <p className={styles.muted}>Waiting for the interviewer to speak…</p>}
      {visible.map((segment) => (
        <p key={segment.id} className={[styles.caption, segment.role === "question" ? styles.captionQuestion : "", segment.role === "chatter" ? styles.captionChatter : "", segment.final ? "" : styles.captionPartial].join(" ")}>
          {segment.text}
        </p>
      ))}
      <div ref={end} />
    </aside>
  );
}

export function LivePanel(props: Props) {
  const { state, records, draft, transcription } = props;
  const [typed, setTyped] = useState("");
  const active = activeQuestion(state);
  const record = active ? records[active.seq] : undefined;
  const listening = bufferText(state);
  const latency = active ? questionLatency(active, record, props.vadSilenceMs) : undefined;
  const transcriptionDown = transcription.status === "error";

  return (
    <div className={styles.room}>
      <header className={styles.bar}>
        <b className={styles.brand}>Steady · Live</b>
        <span className={`${styles.pill} ${props.paused ? styles.pillWarn : styles.pillOn}`}><i />{props.paused ? "Paused" : "Capturing"}</span>
        <span className={`${styles.pill} ${transcription.status === "ready" ? styles.pillOn : transcriptionDown ? styles.pillError : styles.pillWarn}`}>
          <i />{TRANSCRIPTION_LABEL[transcription.status]}{transcription.reconnects > 0 && transcription.status !== "error" ? ` · ${transcription.reconnects} reconnects` : ""}
        </span>
        <span className={styles.latency} title="From the end of the interviewer's speech to Top 3 on screen">Last match {seconds(latency?.totalMs)}</span>
        <span className={styles.spacer} />
        {props.paused
          ? <button className={styles.ghost} onClick={props.onResume}><Play size={14} /> Resume</button>
          : <button className={styles.ghost} onClick={props.onPause}><Pause size={14} /> Pause</button>}
        <button className={styles.stop} onClick={props.onStop}><Square size={13} /> Stop</button>
      </header>

      <div className={styles.grid}>
        <Captions state={state} />

        <main className={styles.stage}>
          {transcriptionDown && transcription.error && (
            <HelpBox
              help={transcription.error.code === "not-configured"
                ? { title: "Live transcription isn't configured", message: "OPENAI_API_KEY is missing on the server.", steps: ["Add OPENAI_API_KEY to Steady_Live_Companion/.env.local and restart `npm run dev`.", "Meanwhile, type the interviewer's question below to search."] }
                : { title: "Transcription stopped", message: transcription.error.message, steps: ["Check your network and retry.", "Captions so far are kept. You can also type the question below."] }}
              action={transcription.error.code !== "not-configured" ? <button className={styles.ghost} onClick={transcription.retry}><RotateCw size={14} /> Retry</button> : undefined}
            />
          )}

          {listening && (
            <div className={styles.listening}>
              <span className={styles.label}>Listening</span>
              <p>{listening}</p>
              {draft?.response.results[0] && <small>Likely match: {draft.response.results[0].attemptedQuestion} (preview)</small>}
            </div>
          )}

          <section className={styles.question}>
            <span className={styles.label}>{active ? `Question ${active.seq}${active.continues ? " · continued" : ""}${active.trigger === "manual" ? " · manual" : ""}` : "Current question"}</span>
            <h1>{active?.text || "No question detected yet."}</h1>
            <div className={styles.actions}>
              <button className={styles.primarySmall} onClick={props.onSearchNow} disabled={!listening}><Search size={14} /> Search now</button>
              <button className={styles.ghost} onClick={props.onResearch} disabled={!active}><RotateCw size={14} /> Search again</button>
              <button className={styles.ghost} onClick={() => active && props.onDismiss(active.seq)} disabled={!active}><X size={14} /> Not a question</button>
            </div>
            <form className={styles.typed} onSubmit={(event) => { event.preventDefault(); props.onTyped(typed); setTyped(""); }}>
              <input value={typed} onChange={(event) => setTyped(event.target.value)} placeholder="Or type the question…" aria-label="Type the question" />
            </form>
          </section>

          {record?.status === "loading" && <p className={styles.muted}>Searching your Best Answers…</p>}
          {record?.status === "error" && <HelpBox help={{ title: "Search failed", message: record.error || "", steps: ["Click “Search again”."] }} />}
          {record?.response && <ResultCards key={active!.seq} response={record.response} />}
          <p className={styles.phaseNote}>Quick Outline and the full practice answer will appear here in Phase 3.</p>
        </main>
      </div>
    </div>
  );
}
