"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { activeQuestion, conversationContext, prefetchText, type CompanionState } from "@/lib/live/companion-reducer";
import type { SearchResponse } from "@/lib/retrieval/types";

export type SearchRecord = {
  seq: number;
  query: string;
  status: "loading" | "done" | "error";
  response?: SearchResponse;
  error?: string;
  startedAt: number;
  doneAt?: number;
};

export type DraftResult = { text: string; response: SearchResponse };

const PREFETCH_DEBOUNCE_MS = 250;

async function searchBestAnswers(query: string, language: string, context: string[], signal: AbortSignal): Promise<SearchResponse> {
  const response = await fetch("/api/best-answers/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, language, limit: 3, conversationContext: context }),
    signal,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Search failed.");
  return body;
}

// Formal search runs once per committed question (or on explicit re-search); a newer question aborts the older request.
// Prefetch runs on partial text and is kept separate so it never overwrites a formal result.
export function useCompanionSearch(state: CompanionState, language: string) {
  const [records, setRecords] = useState<Record<number, SearchRecord>>({});
  const [draft, setDraft] = useState<DraftResult | null>(null);
  const [rerun, setRerun] = useState(0);
  const formalController = useRef<AbortController | null>(null);
  const active = activeQuestion(state);
  const activeSeq = active?.seq;
  const activeText = active?.text;
  const contextRef = useRef<string[]>([]);
  contextRef.current = activeSeq ? conversationContext(state, activeSeq) : [];

  useEffect(() => {
    if (!activeSeq || !activeText) return;
    formalController.current?.abort();
    const controller = new AbortController();
    formalController.current = controller;
    const startedAt = performance.now();
    setRecords((current) => ({ ...current, [activeSeq]: { seq: activeSeq, query: activeText, status: "loading", startedAt } }));
    searchBestAnswers(activeText, language, contextRef.current, controller.signal)
      .then((response) => setRecords((current) => ({ ...current, [activeSeq]: { ...current[activeSeq], status: "done", response, doneAt: performance.now() } })))
      .catch((error: Error) => {
        if (controller.signal.aborted) return;
        setRecords((current) => ({ ...current, [activeSeq]: { ...current[activeSeq], status: "error", error: error.message, doneAt: performance.now() } }));
      });
    setDraft(null);
    return () => controller.abort();
  }, [activeSeq, activeText, language, rerun]);

  const partial = prefetchText(state);
  useEffect(() => {
    if (!partial) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      searchBestAnswers(partial, language, contextRef.current, controller.signal)
        .then((response) => setDraft({ text: partial, response }))
        .catch(() => {});
    }, PREFETCH_DEBOUNCE_MS);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [partial, language]);

  const research = useCallback(() => setRerun((value) => value + 1), []);
  const reset = useCallback(() => { formalController.current?.abort(); setRecords({}); setDraft(null); }, []);

  return { records, draft: partial ? draft : null, research, reset };
}
