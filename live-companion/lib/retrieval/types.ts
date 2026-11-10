import type { ResolvedBestAnswer } from "../best-answers";
import type { MotherScore } from "./intent";

export type SearchRequest = {
  query: string;
  language?: string;
  limit?: number;
  // Recent interviewer turns, oldest first. Used at reduced weight so follow-ups inherit the topic.
  conversationContext?: string[];
};

export type ScoreComponents = {
  semanticSimilarity: number;
  canonicalQuestionSimilarity: number;
  motherThemeMatch: number;
  keywordEntityOverlap: number;
};

// Hits carry a preview, never the full answer body; full text is fetched per answer on demand.
export type SearchHit = Omit<ResolvedBestAnswer, "answerText"> & {
  preview: string;
  score: number;
  components: ScoreComponents;
};

export type SearchResponse = {
  results: SearchHit[];
  confident: boolean;
  threshold: number;
  detectedThemes: MotherScore[];
  latencyMs: number;
};

// The contract any retriever (lexical baseline now, embeddings later) must satisfy.
export interface BestAnswerRetriever {
  kind: string;
  size: number;
  search(request: SearchRequest): SearchResponse;
}
