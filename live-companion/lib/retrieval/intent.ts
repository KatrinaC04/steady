import { QUESTION_MOTHERS, inferMotherId } from "../steady/question-map";
import { conceptsOf } from "./text";

// How strongly each concept points to a Question Map mother theme. Mirrors the curated assignments in question-map.ts.
const CONCEPT_MOTHERS: Record<string, Partial<Record<string, number>>> = {
  conflict: { conflict: 1 },
  alignment: { conflict: 0.8 },
  stakeholder: { conflict: 0.6 },
  "disagree-commit": { conflict: 1 },
  underperformance: { conflict: 1 },
  collaboration: { conflict: 0.4, technical: 0.3 },
  communication: { conflict: 0.5, technical: 0.3 },
  "team-roles": { technical: 0.9 },
  leadership: { leadership: 1 },
  ownership: { leadership: 0.6 },
  "no-authority": { leadership: 1 },
  "beyond-scope": { leadership: 1 },
  inclusion: { leadership: 0.8 },
  "delay-recovery": { leadership: 0.8 },
  ambiguity: { ambiguity: 1 },
  "zero-to-one": { ambiguity: 1 },
  "ownership-gap": { ambiguity: 1 },
  onboarding: { ambiguity: 1 },
  prioritization: { prioritization: 1 },
  constraint: { prioritization: 0.8 },
  deadline: { prioritization: 0.6 },
  "changing-priorities": { prioritization: 0.8 },
  "speed-quality": { prioritization: 1 },
  "ui-functionality": { prioritization: 1 },
  "eng-pushback": { prioritization: 1, judgment: 0.3 },
  failure: { learning: 1 },
  learning: { learning: 0.7 },
  feedback: { learning: 1 },
  hindsight: { learning: 1 },
  strength: { "self-awareness": 1, learning: 0.5 },
  weakness: { "self-awareness": 1, learning: 0.5 },
  customer: { customer: 0.8 },
  "product-sense": { customer: 1 },
  "favorite-product": { customer: 1 },
  "product-critique": { customer: 0.7 },
  launch: { customer: 0.8 },
  scale: { customer: 0.8 },
  trends: { customer: 0.8 },
  microsoft: { customer: 0.3, motivation: 0.6 },
  data: { data: 1 },
  experiment: { data: 1 },
  metric: { data: 1 },
  causality: { data: 1 },
  "evidence-change": { data: 0.8 },
  "data-conflict": { data: 1 },
  innovation: { innovation: 1 },
  risk: { innovation: 1 },
  technical: { technical: 1 },
  tools: { technical: 1 },
  api: { technical: 1 },
  "explain-simply": { technical: 1 },
  process: { execution: 1 },
  ai: { "ai-leverage": 1 },
  "human-judgment": { "ai-leverage": 0.8 },
  hypothetical: { judgment: 0.4 },
  executive: { judgment: 0.8, conflict: 0.3 },
  ethics: { judgment: 1 },
  motivation: { motivation: 1 },
  career: { motivation: 0.8 },
  internship: { motivation: 0.8 },
  "pm-role": { motivation: 0.8 },
};

export type MotherScore = { motherId: string; score: number };

export function motherTitle(motherId: string) {
  return QUESTION_MOTHERS.find((mother) => mother.id === motherId)?.title || "Unmapped";
}

// Returns mother themes ranked by evidence, with scores normalized so the strongest theme is 1.
export function classifyMothers(text: string): MotherScore[] {
  const totals = new Map<string, number>();
  for (const concept of conceptsOf(text)) {
    for (const [motherId, weight] of Object.entries(CONCEPT_MOTHERS[concept] || {})) totals.set(motherId, (totals.get(motherId) || 0) + (weight || 0));
  }
  const inferred = inferMotherId(text);
  if (inferred !== "unmapped") totals.set(inferred, (totals.get(inferred) || 0) + 0.5);
  const max = Math.max(0, ...totals.values());
  if (!max) return [];
  return [...totals.entries()]
    .map(([motherId, score]) => ({ motherId, score: score / max }))
    .sort((a, b) => b.score - a.score || a.motherId.localeCompare(b.motherId));
}
