"use client";

import { useState } from "react";
import { motherTitle } from "@/lib/retrieval/intent";
import type { SearchHit, SearchResponse } from "@/lib/retrieval/types";
import styles from "./live.module.css";

function ResultCard({ hit, rank }: { hit: SearchHit; rank: number }) {
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function toggle() {
    if (full) { setFull(null); return; }
    setLoading(true);
    try {
      const body = await (await fetch(`/api/best-answers/${encodeURIComponent(hit.questionId)}`)).json();
      setFull(body.answerText || body.error || "Could not load this answer.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className={`${styles.card} ${rank === 1 ? styles.cardTop : ""}`}>
      <header>
        <span className={styles.rank}>{rank}</span>
        <h3>{hit.attemptedQuestion}</h3>
        <span className={styles.score} title="Match score (0–1)">{Math.round(hit.score * 100)}</span>
      </header>
      {hit.canonicalQuestion !== hit.attemptedQuestion && <p className={styles.canonical}>Canonical: {hit.canonicalQuestion}</p>}
      <div className={styles.chips}>
        <span>{motherTitle(hit.motherId)}</span>
        <span>{hit.twist}</span>
      </div>
      <p className={styles.answer}>{full || hit.preview}</p>
      <button className={styles.ghost} onClick={toggle} disabled={loading}>{full ? "Show preview" : loading ? "Loading…" : "View original Best Answer"}</button>
    </article>
  );
}

export function ResultCards({ response }: { response: SearchResponse }) {
  return (
    <section aria-label="Matching Best Answers">
      {!response.confident && (
        <p className={styles.lowConfidence}>No high-confidence match. These are the closest Best Answers; use one only if it really fits.</p>
      )}
      {response.results.map((hit, index) => <ResultCard key={hit.questionId} hit={hit} rank={index + 1} />)}
    </section>
  );
}
