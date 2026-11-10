// Live caption + question segmentation state machine. Pure and clock-free: every event carries `now`,
// and the page dispatches `tick` while capturing so timers can be unit-tested with fake times.
import { COMMIT_CONFIDENCE, MIN_WORDS, assessQuestionEnd, wordCount } from "./question-end";

export type Segment = {
  id: string;
  text: string;
  final: boolean;
  startedAt: number;
  stoppedAt?: number;
  finalAt?: number;
  // Set once the segment has been folded into a committed question or dropped as small talk.
  role?: "question" | "chatter";
};

export type Question = {
  seq: number;
  text: string;
  trigger: "auto" | "manual";
  committedAt: number;
  speechStoppedAt?: number;
  finalAt?: number;
  // A continuation replaces the previous question ("...Specifically, one with your manager.").
  continues?: number;
  status: "active" | "superseded" | "dismissed";
};

export type CompanionConfig = {
  // How long to wait after speech stops before committing text that looks unfinished or declarative.
  extendedWaitMs: number;
  // Speech that starts this soon after a commit is treated as the same question continuing.
  mergeWindowMs: number;
  // Give up waiting for a final transcript after this long and use the partial text.
  finalTimeoutMs: number;
};

export const DEFAULT_CONFIG: CompanionConfig = { extendedWaitMs: 1600, mergeWindowMs: 1800, finalTimeoutMs: 3000 };

export type CompanionState = {
  config: CompanionConfig;
  segments: Segment[];
  buffer: string[];
  carry?: { seq: number; text: string };
  speaking: boolean;
  lastStopAt?: number;
  questions: Question[];
};

export type CompanionEvent =
  | { type: "speechStarted"; itemId: string; now: number }
  | { type: "speechStopped"; itemId: string; now: number }
  | { type: "delta"; itemId: string; delta: string; now: number }
  | { type: "completed"; itemId: string; transcript: string; now: number }
  // Transcription of a segment failed: keep whatever partial text arrived and treat it as final.
  | { type: "transcriptionFailed"; itemId: string; now: number }
  // Fallback when audio or transcription is unavailable: the user types the question.
  | { type: "typedQuestion"; text: string; now: number }
  | { type: "tick"; now: number }
  | { type: "manualCommit"; now: number }
  | { type: "dismiss"; seq: number }
  | { type: "configure"; config: Partial<CompanionConfig> }
  | { type: "reset" };

const MAX_SEGMENTS = 300;

export function initialCompanionState(config: Partial<CompanionConfig> = {}): CompanionState {
  return { config: { ...DEFAULT_CONFIG, ...config }, segments: [], buffer: [], speaking: false, questions: [] };
}

function upsertSegment(state: CompanionState, id: string, now: number, patch: (segment: Segment) => Segment): CompanionState {
  const existing = state.segments.find((segment) => segment.id === id);
  if (existing?.role) return state; // Late events for already-consumed speech must not reopen it.
  const segment = patch(existing || { id, text: "", final: false, startedAt: now });
  const segments = existing ? state.segments.map((item) => (item.id === id ? segment : item)) : [...state.segments, segment].slice(-MAX_SEGMENTS);
  const buffer = state.buffer.includes(id) ? state.buffer : [...state.buffer, id];
  return { ...state, segments, buffer };
}

function liveText(state: CompanionState) {
  return state.buffer.map((id) => state.segments.find((segment) => segment.id === id)?.text.trim() || "").filter(Boolean).join(" ");
}

export function bufferText(state: CompanionState) {
  return [state.carry?.text, liveText(state)].filter(Boolean).join(" ").trim();
}

export function activeQuestion(state: CompanionState) {
  const last = state.questions[state.questions.length - 1];
  return last?.status === "active" ? last : undefined;
}

// Earlier interviewer questions that still stand, oldest first, for follow-up context.
export function conversationContext(state: CompanionState, beforeSeq: number, limit = 3) {
  return state.questions.filter((question) => question.seq < beforeSeq && question.status === "active").slice(-limit).map((question) => question.text);
}

function settleBuffer(state: CompanionState, role: Segment["role"]) {
  const ids = new Set(state.buffer);
  return { ...state, buffer: [], carry: undefined, segments: state.segments.map((segment) => (ids.has(segment.id) ? { ...segment, role } : segment)) };
}

function commit(state: CompanionState, now: number, trigger: Question["trigger"]): CompanionState {
  const text = bufferText(state);
  if (!text) return state;
  const buffered = state.segments.filter((segment) => state.buffer.includes(segment.id));
  const finals = buffered.map((segment) => segment.finalAt).filter((value): value is number => value !== undefined);
  const seq = (state.questions[state.questions.length - 1]?.seq || 0) + 1;
  const continues = state.carry?.seq;
  const questions = state.questions.map((question) => (question.seq === continues ? { ...question, status: "superseded" as const } : question));
  const question: Question = { seq, text, trigger, committedAt: now, speechStoppedAt: state.lastStopAt, finalAt: finals.length ? Math.max(...finals) : undefined, continues, status: "active" };
  return { ...settleBuffer(state, "question"), questions: [...questions, question] };
}

function evaluate(state: CompanionState, now: number): CompanionState {
  if (state.speaking || !state.buffer.length || state.lastStopAt === undefined) return state;
  const sinceStop = now - state.lastStopAt;
  const pendingFinal = state.buffer.some((id) => !state.segments.find((segment) => segment.id === id)?.final);
  if (pendingFinal && sinceStop < state.config.finalTimeoutMs) return state;
  // Judge small talk on the new words alone, so an "mm-hmm" after a question never re-commits that question.
  if (assessQuestionEnd(liveText(state)).kind === "not-question") {
    // Keep a lone "okay" around briefly in case the real question follows; then file it as chatter.
    return sinceStop < state.config.extendedWaitMs ? state : settleBuffer(state, "chatter");
  }
  const assessment = assessQuestionEnd(bufferText(state));
  if (assessment.confidence >= COMMIT_CONFIDENCE || sinceStop >= state.config.extendedWaitMs) return commit(state, now, "auto");
  return state;
}

export function companionReducer(state: CompanionState, event: CompanionEvent): CompanionState {
  switch (event.type) {
    case "speechStarted": {
      let next: CompanionState = { ...state, speaking: true };
      const last = state.questions[state.questions.length - 1];
      if (!state.buffer.length && last?.status === "active" && event.now - last.committedAt < state.config.mergeWindowMs) next = { ...next, carry: { seq: last.seq, text: last.text } };
      return upsertSegment(next, event.itemId, event.now, (segment) => segment);
    }
    case "delta":
      return upsertSegment(state, event.itemId, event.now, (segment) => (segment.final ? segment : { ...segment, text: segment.text + event.delta }));
    case "speechStopped":
      return upsertSegment({ ...state, speaking: false, lastStopAt: event.now }, event.itemId, event.now, (segment) => ({ ...segment, stoppedAt: event.now }));
    case "completed": {
      const next = upsertSegment(state, event.itemId, event.now, (segment) => ({ ...segment, text: event.transcript.trim(), final: true, finalAt: event.now }));
      return evaluate(next, event.now);
    }
    case "transcriptionFailed": {
      const next = upsertSegment(state, event.itemId, event.now, (segment) => ({ ...segment, final: true, finalAt: event.now }));
      return evaluate(next, event.now);
    }
    case "typedQuestion": {
      const text = event.text.trim();
      if (!text) return state;
      const id = `typed-${event.now}`;
      const typed: CompanionState = { ...settleBuffer(state, "chatter"), segments: [...state.segments, { id, text, final: true, startedAt: event.now, finalAt: event.now }].slice(-MAX_SEGMENTS), buffer: [id], lastStopAt: event.now };
      return commit(typed, event.now, "manual");
    }
    case "tick":
      return evaluate(state, event.now);
    case "manualCommit":
      return commit({ ...state, lastStopAt: state.lastStopAt ?? event.now }, event.now, "manual");
    case "dismiss":
      return { ...state, questions: state.questions.map((question) => (question.seq === event.seq ? { ...question, status: "dismissed" } : question)) };
    case "configure":
      return { ...state, config: { ...state.config, ...event.config } };
    case "reset":
      return initialCompanionState(state.config);
  }
}

// Text worth prefetching against while the interviewer is still talking.
export function prefetchText(state: CompanionState) {
  const text = bufferText(state);
  return wordCount(text) >= MIN_WORDS + 2 ? text : "";
}
