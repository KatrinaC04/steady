import type { ResolvedBestAnswer } from "../best-answers";
import { QUESTION_MOTHERS } from "../steady/question-map";
import { classifyMothers } from "./intent";
import { entityTerms, features, wordTokens } from "./text";
import type { BestAnswerRetriever, ScoreComponents, SearchHit, SearchRequest, SearchResponse } from "./types";

export const WEIGHTS = { semanticSimilarity: 0.55, canonicalQuestionSimilarity: 0.2, motherThemeMatch: 0.15, keywordEntityOverlap: 0.1 } as const;
// Calibrated on eval/prompts.json: unrelated prompts top out near 0.11, correct top-1 matches have P10 ≈ 0.25.
export const CONFIDENCE_THRESHOLD = 0.2;
const CONTEXT_WEIGHT = 0.35;
const ANSWER_WEIGHT = 0.15;
const THEME_WEIGHT = 0.5;

type Vector = Map<string, number>;
type IndexedDoc = { answer: ResolvedBestAnswer; question: Vector; full: Vector; answerTokens: Set<string> };

function addInto(target: Vector, source: Vector, scale = 1) {
  for (const [key, value] of source) target.set(key, (target.get(key) || 0) + value * scale);
  return target;
}

function weigh(counts: Vector, idf: Map<string, number>, fallbackIdf: number): Vector {
  const vector: Vector = new Map();
  let norm = 0;
  for (const [term, count] of counts) {
    // Sublinear tf; fractional counts come from down-weighted fields (theme text, answer body, context).
    const tf = count >= 1 ? 1 + Math.log(count) : count;
    const value = tf * (idf.get(term) ?? fallbackIdf);
    if (value > 0) { vector.set(term, value); norm += value * value; }
  }
  norm = Math.sqrt(norm);
  if (norm) for (const [term, value] of vector) vector.set(term, value / norm);
  return vector;
}

function cosine(a: Vector, b: Vector) {
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [term, value] of small) dot += value * (large.get(term) || 0);
  return dot;
}

const round = (value: number) => Math.round(value * 1000) / 1000;

export function preview(text: string, maxChars = 240) {
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), maxChars * 0.7))}…`;
}

// Deterministic baseline: TF-IDF cosine over words + intent concepts, blended with mother-theme and entity signals.
// It implements the same BestAnswerRetriever interface an embedding retriever will implement later.
export function createLexicalRetriever(answers: ResolvedBestAnswer[]): BestAnswerRetriever {
  const raw = answers.map((answer) => {
    const mother = QUESTION_MOTHERS.find((item) => item.id === answer.motherId);
    const questionText = answer.attemptedQuestion === answer.canonicalQuestion ? answer.canonicalQuestion : `${answer.canonicalQuestion}\n${answer.attemptedQuestion}`;
    const question = features(questionText);
    const full = addInto(new Map(question), features(`${answer.twist}. ${mother?.title || ""}. ${mother?.corePrompt || ""}`), THEME_WEIGHT);
    addInto(full, features(answer.answerText, 0.5), ANSWER_WEIGHT);
    return { answer, question, full, answerTokens: new Set(wordTokens(answer.answerText)) };
  });

  const documentFrequency = new Map<string, number>();
  for (const doc of raw) for (const term of doc.full.keys()) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
  const total = Math.max(raw.length, 1);
  const idf = new Map([...documentFrequency].map(([term, df]) => [term, Math.log(1 + total / df)]));
  const unseenIdf = Math.log(1 + total);

  const docs: IndexedDoc[] = raw.map((doc) => ({ ...doc, question: weigh(doc.question, idf, unseenIdf), full: weigh(doc.full, idf, unseenIdf) }));

  function search(request: SearchRequest): SearchResponse {
    const started = performance.now();
    const limit = Math.max(1, Math.min(request.limit ?? 3, 10));
    const query = request.query.trim();
    const context = (request.conversationContext || []).filter(Boolean).slice(-3).join("\n");
    const queryCounts = addInto(features(query), context ? features(context) : new Map(), CONTEXT_WEIGHT);
    const queryVector = weigh(queryCounts, idf, unseenIdf);
    const mothers = classifyMothers(context ? `${query}\n${context}` : query);
    const motherScore = new Map(mothers.map((item) => [item.motherId, item.score]));
    const entities = entityTerms(query).flatMap((term) => wordTokens(term));
    const weights = entities.length ? WEIGHTS : { ...WEIGHTS, keywordEntityOverlap: 0 };
    const weightSum = Object.values(weights).reduce((sum, value) => sum + value, 0);

    const hits: SearchHit[] = query ? docs.map((doc) => {
      const components: ScoreComponents = {
        semanticSimilarity: cosine(queryVector, doc.full),
        canonicalQuestionSimilarity: cosine(queryVector, doc.question),
        motherThemeMatch: motherScore.get(doc.answer.motherId) || 0,
        keywordEntityOverlap: entities.length ? entities.filter((term) => doc.answerTokens.has(term)).length / entities.length : 0,
      };
      const score = (Object.keys(weights) as (keyof ScoreComponents)[]).reduce((sum, key) => sum + weights[key] * components[key], 0) / weightSum;
      const { answerText, ...metadata } = doc.answer;
      return {
        ...metadata,
        preview: preview(answerText),
        score: round(score),
        components: Object.fromEntries(Object.entries(components).map(([key, value]) => [key, round(value)])) as ScoreComponents,
      };
    }) : [];

    hits.sort((a, b) => b.score - a.score || a.questionId.localeCompare(b.questionId));
    const results = hits.slice(0, limit);
    return {
      results,
      confident: (results[0]?.score || 0) >= CONFIDENCE_THRESHOLD,
      threshold: CONFIDENCE_THRESHOLD,
      detectedThemes: mothers.slice(0, 3),
      latencyMs: round(performance.now() - started),
    };
  }

  return { kind: "lexical-v1", size: docs.length, search };
}
