import type { CompanionState, Question } from "./companion-reducer";
import type { SearchResponse } from "../retrieval/types";

type SearchTiming = { status: string; response?: SearchResponse; startedAt: number; doneAt?: number };

export type QuestionLatency = {
  // From the interviewer's estimated end of speech (VAD stop minus its silence window).
  asrFinalMs?: number;
  detectMs?: number;
  searchMs?: number;
  totalMs?: number;
};

export function questionLatency(question: Question, record: SearchTiming | undefined, vadSilenceMs: number): QuestionLatency {
  if (question.trigger === "manual" || question.speechStoppedAt === undefined) {
    // Manual triggers are timed from the click.
    return { searchMs: record?.doneAt !== undefined ? record.doneAt - question.committedAt : undefined, totalMs: record?.doneAt !== undefined ? record.doneAt - question.committedAt : undefined };
  }
  const speechEnd = question.speechStoppedAt - vadSilenceMs;
  return {
    asrFinalMs: question.finalAt !== undefined ? question.finalAt - speechEnd : undefined,
    detectMs: question.committedAt - speechEnd,
    searchMs: record?.doneAt !== undefined ? record.doneAt - question.committedAt : undefined,
    totalMs: record?.doneAt !== undefined ? record.doneAt - speechEnd : undefined,
  };
}

export function median(values: number[]) {
  if (!values.length) return undefined;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// What a user may choose to download after a mock: questions, stable captions, matched sources, and timings.
// No audio, and no Best Answer bodies beyond the previews already shown.
export function buildReview(state: CompanionState, records: Record<number, SearchTiming>, meta: { language: string; source: string; vadSilenceMs: number; startedAt: string }) {
  return {
    ...meta,
    endedAt: new Date().toISOString(),
    questions: state.questions.map((question) => {
      const record = records[question.seq];
      return {
        seq: question.seq,
        text: question.text,
        trigger: question.trigger,
        status: question.status,
        confident: record?.response?.confident,
        matches: record?.response?.results.map((hit) => ({ questionId: hit.questionId, question: hit.attemptedQuestion, score: hit.score })) || [],
        latencyMs: questionLatency(question, record, meta.vadSilenceMs),
      };
    }),
    captions: state.segments.filter((segment) => segment.final && segment.text).map((segment) => ({ text: segment.text, role: segment.role || "pending" })),
  };
}
