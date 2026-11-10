"use client";

import { useEffect, useState } from "react";
import type { SearchHit, SearchResponse } from "@/lib/retrieval/types";

type IndexSummary = { count: number; updatedAt: string | null; retriever: string; warnings: { questionId: string; code: string }[] };

// Phase 1 test page: check the index and try rephrased questions before the live audio flow exists.
export default function SearchTestPage() {
  const [summary, setSummary] = useState<IndexSummary | null>(null);
  const [query, setQuery] = useState("Tell me about a time you disagreed with a stakeholder");
  const [response, setResponse] = useState<SearchResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/best-answers/index").then((res) => res.json()).then(setSummary).catch(() => setError("Could not load the Best Answer index."));
  }, []);

  async function search(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/best-answers/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query, limit: 3 }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setResponse(body);
    } catch (caught) {
      setError((caught as Error).message || "Search failed.");
    } finally {
      setLoading(false);
    }
  }

  async function toggle(hit: SearchHit) {
    if (expanded[hit.questionId]) { setExpanded(({ [hit.questionId]: _, ...rest }) => rest); return; }
    const body = await (await fetch(`/api/best-answers/${encodeURIComponent(hit.questionId)}`)).json();
    setExpanded((current) => ({ ...current, [hit.questionId]: body.answerText || body.error }));
  }

  return (
    <main className="shell">
      <h1>Best Answer search</h1>
      <p>Phase 1 retrieval check. Only answers you selected as Best Answer in Steady are searched. <a href="/live-companion">Open the Live Mock Companion →</a></p>
      {summary && (
        <div className="status">
          <span><b>{summary.count}</b> Best Answers</span>
          <span>Updated {summary.updatedAt ? new Date(summary.updatedAt).toLocaleString() : "—"}</span>
          <span>Retriever {summary.retriever}</span>
          {summary.warnings.length > 0 && <span className="warn">{summary.warnings.length} invalid references</span>}
        </div>
      )}
      {summary?.count === 0 && <p className="error">No Best Answers yet. Choose Best Answers in Steady&apos;s Question Bank, then reload.</p>}
      <form onSubmit={search}>
        <textarea value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Interviewer question" />
        <button disabled={loading || !query.trim()}>{loading ? "Searching…" : "Search"}</button>
      </form>
      {error && <p className="error">{error}</p>}
      {response && (
        <>
          <p className="meta">
            {response.confident ? "High-confidence match" : <span className="lowConfidence">No high-confidence match. Pick a candidate below if one fits.</span>}
            {" · "}themes {response.detectedThemes.map((theme) => theme.motherId).join(", ") || "none"} · {response.latencyMs} ms
          </p>
          {response.results.map((hit) => (
            <article className="hit" key={hit.questionId}>
              <header><h3>{hit.attemptedQuestion}</h3><span className="score">{hit.score.toFixed(2)}</span></header>
              {hit.canonicalQuestion !== hit.attemptedQuestion && <small>Canonical: {hit.canonicalQuestion}</small>}
              <div className="chips"><span>{hit.motherId}</span><span>{hit.category}</span><span>{hit.twist}</span></div>
              <p>{expanded[hit.questionId] || hit.preview}</p>
              <button onClick={() => toggle(hit)}>{expanded[hit.questionId] ? "Collapse" : "View original Best Answer"}</button>
            </article>
          ))}
        </>
      )}
    </main>
  );
}
