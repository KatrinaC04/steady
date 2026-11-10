"use client";

import { Download, RotateCcw } from "lucide-react";
import type { SearchRecord } from "@/hooks/useCompanionSearch";
import type { CompanionState } from "@/lib/live/companion-reducer";
import { median, questionLatency } from "@/lib/live/metrics";
import styles from "./live.module.css";

type Props = { state: CompanionState; records: Record<number, SearchRecord>; vadSilenceMs: number; endedByShare: boolean; onDownload(): void; onRestart(): void };

export function ReviewPanel({ state, records, vadSilenceMs, endedByShare, onDownload, onRestart }: Props) {
  const questions = state.questions.filter((question) => question.status !== "superseded");
  const answered = questions.filter((question) => question.status === "active");
  const totals = answered.map((question) => questionLatency(question, records[question.seq], vadSilenceMs).totalMs).filter((value): value is number => value !== undefined);
  const confident = answered.filter((question) => records[question.seq]?.response?.confident).length;
  const p50 = median(totals);

  return (
    <main className={styles.setup}>
      <header className={styles.setupHero}>
        <span className={styles.eyebrow}>Mock review</span>
        <h1>Capture stopped.</h1>
        <p>{endedByShare ? "The audio share ended. " : ""}No audio was saved. This review lives only in this page unless you download it.</p>
      </header>
      <div className={styles.indexStatus}>
        <span><b>{answered.length}</b> questions</span>
        <span><b>{confident}</b> confident matches</span>
        <span>Median time to Top 3 <b>{p50 === undefined ? "—" : `${(p50 / 1000).toFixed(1)} s`}</b></span>
      </div>
      <ol className={styles.reviewList}>
        {questions.map((question) => {
          const record = records[question.seq];
          const top = record?.response?.results[0];
          const latency = questionLatency(question, record, vadSilenceMs);
          return (
            <li key={question.seq} className={question.status === "dismissed" ? styles.dismissed : ""}>
              <b>{question.text}</b>
              <small>
                {question.status === "dismissed" ? "Marked not a question" : top ? `${record.response!.confident ? "Matched" : "Low confidence"}: ${top.attemptedQuestion} (${Math.round(top.score * 100)})` : "No match"}
                {latency.totalMs !== undefined && ` · ${(latency.totalMs / 1000).toFixed(1)} s`}
              </small>
            </li>
          );
        })}
      </ol>
      <div className={styles.actions}>
        <button className={styles.ghostDark} onClick={onDownload} disabled={!state.questions.length}><Download size={14} /> Download review (JSON)</button>
        <button className={styles.primary} onClick={onRestart}><RotateCcw size={14} /> New session</button>
      </div>
    </main>
  );
}
