"use client";

import { AlertTriangle, CheckCircle2, Headphones, Mic, Monitor, PanelTop, ShieldCheck } from "lucide-react";
import type { AudioSource, ErrorHelp } from "@/lib/live/capture";
import { VAD_SILENCE_RANGE, type CompanionLanguage } from "@/lib/live/realtime-session";
import styles from "./live.module.css";

export type IndexSummary = { count: number; updatedAt: string | null; warnings: { questionId: string; code: string }[] };

const SOURCES: { id: AudioSource; label: string; detail: string; icon: typeof Monitor }[] = [
  { id: "tab", label: "Teams web tab", detail: "Recommended. Pick the Teams tab and turn on “Also share tab audio”.", icon: PanelTop },
  { id: "screen", label: "Entire screen + system audio", detail: "For the Teams desktop app on Windows. Usually unavailable on macOS.", icon: Monitor },
  { id: "microphone", label: "Microphone fallback", detail: "Only works with speakers, not headphones. It also picks up your own voice.", icon: Mic },
];

export function HelpBox({ help, action }: { help: ErrorHelp; action?: React.ReactNode }) {
  return (
    <div className={styles.help} role="alert">
      <b><AlertTriangle size={15} /> {help.title}</b>
      <p>{help.message}</p>
      <ol>{help.steps.map((step) => <li key={step}>{step}</li>)}</ol>
      {action}
    </div>
  );
}

type Props = {
  index: IndexSummary | null | "error";
  source: AudioSource;
  onSource(source: AudioSource): void;
  language: CompanionLanguage;
  onLanguage(language: CompanionLanguage): void;
  silenceMs: number;
  onSilence(value: number): void;
  sharing: { label: string; level: number } | null;
  captureHelp: ErrorHelp | null;
  requesting: boolean;
  consent: boolean;
  onConsent(value: boolean): void;
  onShare(): void;
  onStopShare(): void;
  onStart(): void;
};

export function SetupPanel(props: Props) {
  const { index, sharing } = props;
  const noAnswers = index !== null && index !== "error" && index.count === 0;
  const canStart = Boolean(sharing) && props.consent && index !== null && index !== "error" && index.count > 0;

  return (
    <main className={styles.setup}>
      <header className={styles.setupHero}>
        <span className={styles.eyebrow}><Headphones size={14} /> Live Mock Companion</span>
        <h1>Hear the question. Recall your best answer.</h1>
        <p>Transcribes the interviewer in a Teams mock and surfaces the Best Answers you already chose in Steady.</p>
      </header>

      <section className={styles.notice}>
        <ShieldCheck size={18} />
        <div>
          <b>For consented mock interviews and practice only</b>
          <p>Only the audio source you pick is sent for live transcription. Audio is never saved. Captions and matches stay in this page and disappear when you close it, unless you download a review at the end.</p>
        </div>
      </section>

      <section className={styles.block}>
        <h2>1 · Audio source</h2>
        <div className={styles.sources} role="radiogroup" aria-label="Audio source">
          {SOURCES.map(({ id, label, detail, icon: Icon }) => (
            <button key={id} role="radio" aria-checked={props.source === id} className={props.source === id ? styles.sourceActive : ""} onClick={() => props.onSource(id)} disabled={Boolean(sharing)}>
              <Icon size={18} />
              <span><b>{label}</b><small>{detail}</small></span>
            </button>
          ))}
        </div>
        <div className={styles.row}>
          <label>Interview language
            <select value={props.language} onChange={(event) => props.onLanguage(event.target.value as CompanionLanguage)}>
              <option value="English">English</option>
              <option value="中文">中文</option>
              <option value="Bilingual">Mixed / bilingual</option>
            </select>
          </label>
          <label>End-of-question silence <span>{props.silenceMs} ms</span>
            <input type="range" min={VAD_SILENCE_RANGE.min} max={VAD_SILENCE_RANGE.max} step={50} value={props.silenceMs} onChange={(event) => props.onSilence(Number(event.target.value))} />
          </label>
        </div>
      </section>

      <section className={styles.block}>
        <h2>2 · Best Answer index</h2>
        {index === null && <p className={styles.muted}>Loading…</p>}
        {index === "error" && <HelpBox help={{ title: "Couldn't load your Best Answers", message: "The index API didn't respond.", steps: ["Check that STEADY_DATA_DIR in .env.local points at Steady's data folder, then reload."] }} />}
        {index && index !== "error" && (
          <div className={styles.indexStatus}>
            <span><b>{index.count}</b> Best Answers</span>
            <span>Last updated {index.updatedAt ? new Date(index.updatedAt).toLocaleString() : "—"}</span>
            <span className={index.warnings.length ? styles.warnText : ""}>{index.warnings.length} invalid references</span>
          </div>
        )}
        {noAnswers && <HelpBox help={{ title: "No Best Answers selected yet", message: "Live matching only uses answers you marked as Best Answer.", steps: ["Open Steady's Question library (http://localhost:3000/library).", "Mark a Best Answer for the questions you've practiced, then reload this page."] }} />}
      </section>

      <section className={styles.block}>
        <h2>3 · Share and test audio</h2>
        {!sharing ? (
          <button className={styles.primary} onClick={props.onShare} disabled={props.requesting}>{props.requesting ? "Waiting for the picker…" : "Start sharing audio"}</button>
        ) : (
          <div className={styles.sharing}>
            <CheckCircle2 size={16} />
            <span className={styles.trackLabel}>Sharing: {sharing.label || "audio"}</span>
            <div className={styles.meter} aria-label="Audio level"><i style={{ width: `${Math.round(sharing.level * 100)}%` }} /></div>
            <button className={styles.ghost} onClick={props.onStopShare}>Change source</button>
          </div>
        )}
        {sharing && sharing.level < 0.05 && <p className={styles.muted}>No sound yet. Play something in the shared tab or ask the interviewer to speak, and the meter should move.</p>}
        {props.captureHelp && <HelpBox help={props.captureHelp} />}
      </section>

      <section className={styles.block}>
        <label className={styles.consent}>
          <input type="checkbox" checked={props.consent} onChange={(event) => props.onConsent(event.target.checked)} />
          Everyone in this mock knows I&apos;m using a live transcription aid.
        </label>
        <button className={styles.primary} onClick={props.onStart} disabled={!canStart}>Start Mock Companion</button>
      </section>
    </main>
  );
}
