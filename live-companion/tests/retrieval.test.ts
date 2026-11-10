import { describe, expect, it } from "vitest";
import type { ResolvedBestAnswer } from "@/lib/best-answers";
import { classifyMothers } from "@/lib/retrieval/intent";
import { CONFIDENCE_THRESHOLD, createLexicalRetriever } from "@/lib/retrieval/lexical-retriever";

function doc(questionId: string, canonicalQuestion: string, motherId: string, answerText: string): ResolvedBestAnswer {
  return { questionId, canonicalQuestion, attemptedQuestion: canonicalQuestion, category: "test", source: "structured-bank", motherId, twist: "", answerText, answerTextSource: "transcript", sessionId: "s", answerCreatedAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" };
}

const corpus = [
  doc("conflict", "Describe a conflict you managed and what you personally did.", "conflict", "At Acme, engineering and operations disagreed about escalation rules."),
  doc("failure", "Tell me about an approach that did not work and what you changed.", "learning", "My Three.js homepage design failed usability testing, so I learned to prototype earlier."),
  doc("why-msft", "Why Microsoft, and why this product-management role now?", "motivation", "Microsoft products like Windows and Loop shaped how I work."),
  doc("ai", "How did you use AI to improve a real workflow and verify the output?", "ai-leverage", "I used an LLM to draft evaluation rubrics, then verified samples by hand."),
  doc("prioritize", "Tell me about a decision involving limited time, engineering capacity, or scope.", "prioritization", "With two engineers and three weeks, we cut the leaderboard and shipped the core evaluator."),
];
const retriever = createLexicalRetriever(corpus);

describe("lexical retriever", () => {
  it.each([
    ["Tell me about a time you disagreed with a stakeholder.", "conflict"],
    ["What's a mistake you made and what did you learn?", "failure"],
    ["Why do you want to join Microsoft?", "why-msft"],
    ["How do you use ChatGPT at work, and how do you check it isn't hallucinating?", "ai"],
    ["How do you decide what to cut when the deadline is tight?", "prioritize"],
    ["讲一个你和同事意见不一致的经历", "conflict"],
    ["你为什么想加入微软？", "why-msft"],
  ])("ranks the intended answer first for %s", (query, expected) => {
    const response = retriever.search({ query });
    expect(response.results[0].questionId).toBe(expected);
    expect(response.confident).toBe(true);
  });

  it("returns Top 3 by default and respects limit bounds", () => {
    expect(retriever.search({ query: "conflict" }).results).toHaveLength(3);
    expect(retriever.search({ query: "conflict", limit: 1 }).results).toHaveLength(1);
    expect(retriever.search({ query: "conflict", limit: 50 }).results).toHaveLength(corpus.length);
  });

  it("is deterministic and breaks score ties by questionId", () => {
    const twins = createLexicalRetriever([doc("b", "Same question?", "conflict", "same"), doc("a", "Same question?", "conflict", "same")]);
    const first = twins.search({ query: "Same question?" });
    expect(first.results.map((hit) => hit.questionId)).toEqual(["a", "b"]);
    expect(twins.search({ query: "Same question?" }).results).toEqual(first.results);
  });

  it("flags unrelated questions as low confidence instead of guessing", () => {
    const response = retriever.search({ query: "How many golf balls fit in a school bus?" });
    expect(response.confident).toBe(false);
    expect(response.results[0].score).toBeLessThan(CONFIDENCE_THRESHOLD);
    expect(response.results).toHaveLength(3);
  });

  it("returns nothing for a blank query", () => {
    expect(retriever.search({ query: "   " })).toMatchObject({ results: [], confident: false });
  });

  it("returns previews and score components, never the full answer body", () => {
    const [hit] = retriever.search({ query: "conflict with operations" }).results;
    expect(hit).not.toHaveProperty("answerText");
    expect(hit.preview).toContain("Acme");
    expect(Object.keys(hit.components).sort()).toEqual(["canonicalQuestionSimilarity", "keywordEntityOverlap", "motherThemeMatch", "semanticSimilarity"]);
  });

  it("uses named entities in the question to match answer bodies", () => {
    const [hit] = retriever.search({ query: "Walk me through the Three.js decision." }).results;
    expect(hit.questionId).toBe("failure");
    expect(hit.components.keywordEntityOverlap).toBe(1);
  });

  it("lets conversation context steer a vague follow-up", () => {
    const followUp = "And what would you do differently?";
    const score = (context?: string[]) => retriever.search({ query: followUp, conversationContext: context, limit: 5 }).results.find((hit) => hit.questionId === "conflict")!.score;
    expect(score(["Describe a conflict between engineering and operations."])).toBeGreaterThan(score());
  });
});

describe("classifyMothers", () => {
  it("detects themes across English, Chinese, and mixed phrasing", () => {
    expect(classifyMothers("Tell me about a time you pushed back on a stakeholder")[0].motherId).toBe("conflict");
    expect(classifyMothers("讲一个你失败的经历")[0].motherId).toBe("learning");
    expect(classifyMothers("你怎么 prioritize 当 engineering capacity 不够")[0].motherId).toBe("prioritization");
    expect(classifyMothers("What is your salary expectation?")).toEqual([]);
  });
});
