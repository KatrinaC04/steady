import { describe, expect, it } from "vitest";
import { activeQuestion, companionReducer, conversationContext, initialCompanionState, prefetchText, type CompanionEvent, type CompanionState } from "@/lib/live/companion-reducer";

const run = (events: CompanionEvent[], state: CompanionState = initialCompanionState()) => events.reduce(companionReducer, state);

// One VAD segment: start, streamed deltas, stop, and (optionally) the final transcript.
function utterance(id: string, text: string, at: number, options: { final?: boolean; finalDelay?: number } = {}): CompanionEvent[] {
  const words = text.split(" ");
  const events: CompanionEvent[] = [{ type: "speechStarted", itemId: id, now: at }];
  words.forEach((word, index) => events.push({ type: "delta", itemId: id, delta: (index ? " " : "") + word, now: at + 100 * (index + 1) }));
  const stop = at + 100 * (words.length + 1);
  events.push({ type: "speechStopped", itemId: id, now: stop });
  if (options.final !== false) events.push({ type: "completed", itemId: id, transcript: text, now: stop + (options.finalDelay ?? 300) });
  return events;
}

const ticks = (from: number, to: number, step = 100): CompanionEvent[] => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, index) => ({ type: "tick", now: from + index * step }));

describe("companionReducer", () => {
  it("commits a clear question exactly once when its final transcript arrives", () => {
    const state = run([
      ...utterance("a", "Tell me about a time you disagreed with a stakeholder?", 0),
      ...ticks(1500, 5000),
      { type: "completed", itemId: "a", transcript: "duplicate final", now: 5100 },
    ]);
    expect(state.questions).toHaveLength(1);
    expect(state.questions[0]).toMatchObject({ seq: 1, text: "Tell me about a time you disagreed with a stakeholder?", trigger: "auto", status: "active" });
    expect(state.segments[0].role).toBe("question");
  });

  it("does not commit while the partial is still streaming", () => {
    const state = run([...utterance("a", "Tell me about a time you led a team?", 0, { final: false }), ...ticks(900, 2000)]);
    expect(state.questions).toHaveLength(0);
    expect(prefetchText(state)).toBe("Tell me about a time you led a team?");
  });

  it("falls back to the partial transcript when the final never arrives", () => {
    const state = run([...utterance("a", "Tell me about a time you led a team?", 0, { final: false }), ...ticks(900, 4500)]);
    expect(state.questions.map((question) => question.text)).toEqual(["Tell me about a time you led a team?"]);
  });

  it("waits through a mid-question pause and joins both halves", () => {
    const state = run([
      ...utterance("a", "Tell me about a conflict and", 0),
      ...ticks(900, 1400),
      ...utterance("b", "how you resolved it with your manager.", 1500),
      ...ticks(2700, 3000),
    ]);
    expect(state.questions.map((question) => question.text)).toEqual(["Tell me about a conflict and how you resolved it with your manager."]);
  });

  it("commits unfinished-looking text after the extended wait", () => {
    const state = run([...utterance("a", "Next I want to understand your leadership experience", 0), ...ticks(900, 1800)]);
    expect(state.questions).toHaveLength(0);
    expect(run(ticks(1900, 2600), state).questions).toHaveLength(1);
  });

  it("treats speech right after a commit as a continuation that supersedes it", () => {
    const state = run([
      ...utterance("a", "Tell me about a conflict you managed.", 0),
      ...utterance("b", "Ideally one with a senior stakeholder.", 1800),
      ...ticks(2700, 3200),
    ]);
    expect(state.questions.map((question) => [question.text, question.status, question.continues])).toEqual([
      ["Tell me about a conflict you managed.", "superseded", undefined],
      ["Tell me about a conflict you managed. Ideally one with a senior stakeholder.", "active", 1],
    ]);
  });

  it("files small talk as chatter without creating or re-triggering a question", () => {
    const state = run([
      ...utterance("a", "Why Microsoft?", 0),
      ...utterance("b", "Mm-hmm.", 1000),
      ...ticks(1500, 4000),
      ...utterance("c", "Okay, great.", 9000),
      ...ticks(9500, 12000),
    ]);
    expect(state.questions.map((question) => question.text)).toEqual(["Why Microsoft?"]);
    expect(state.segments.filter((segment) => segment.role === "chatter").map((segment) => segment.id)).toEqual(["b", "c"]);
  });

  it("separates distinct questions and passes earlier ones as context", () => {
    const state = run([
      ...utterance("a", "Tell me about a conflict you managed.", 0),
      ...utterance("b", "What would you do differently next time?", 20000),
    ]);
    const second = activeQuestion(state)!;
    expect(second.seq).toBe(2);
    expect(conversationContext(state, second.seq)).toEqual(["Tell me about a conflict you managed."]);
  });

  it("lets the user commit early with Search now, then ignores that segment's late final", () => {
    const state = run([
      { type: "speechStarted", itemId: "a", now: 0 },
      { type: "delta", itemId: "a", delta: "Tell me about your favorite product", now: 300 },
      { type: "manualCommit", now: 400 },
      { type: "completed", itemId: "a", transcript: "Tell me about your favorite product and why.", now: 900 },
      ...ticks(1000, 4000),
    ]);
    expect(state.questions.map((question) => [question.text, question.trigger])).toEqual([["Tell me about your favorite product", "manual"]]);
  });

  it("ignores Search now when nothing has been heard", () => {
    expect(run([{ type: "manualCommit", now: 0 }]).questions).toEqual([]);
  });

  it("drops dismissed questions from context", () => {
    const state = run([
      ...utterance("a", "Can you hear me okay?", 0),
      { type: "dismiss", seq: 1 },
      ...utterance("b", "Tell me about a time you failed?", 20000),
    ]);
    expect(state.questions[0].status).toBe("dismissed");
    expect(activeQuestion(state)?.seq).toBe(2);
    expect(conversationContext(state, 2)).toEqual([]);
  });

  it("accepts a typed question as a manual commit", () => {
    const state = run([{ type: "typedQuestion", text: "  Why this role?  ", now: 50 }, { type: "typedQuestion", text: " ", now: 60 }]);
    expect(state.questions.map((question) => [question.text, question.trigger])).toEqual([["Why this role?", "manual"]]);
  });

  it("treats a failed transcription as final with its partial text", () => {
    const state = run([...utterance("a", "Walk me through your resume.", 0, { final: false }), { type: "transcriptionFailed", itemId: "a", now: 700 }]);
    expect(state.questions.map((question) => question.text)).toEqual(["Walk me through your resume."]);
  });

  it("resets to an empty session but keeps the configuration", () => {
    const configured = run([{ type: "configure", config: { extendedWaitMs: 999 } }, ...utterance("a", "Why Microsoft?", 0)]);
    const reset = companionReducer(configured, { type: "reset" });
    expect(reset).toMatchObject({ segments: [], questions: [], buffer: [] });
    expect(reset.config.extendedWaitMs).toBe(999);
  });
});
