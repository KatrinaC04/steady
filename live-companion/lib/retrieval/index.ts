import { promises as fs } from "fs";
import { getResolvedBestAnswers, readBestAnswerSelections, type ResolveResult, type ResolvedBestAnswer } from "../best-answers";
import { bestAnswersFile, sessionFile, steadyDataDir } from "../config";
import { createLexicalRetriever } from "./lexical-retriever";
import type { BestAnswerRetriever } from "./types";

export type BestAnswerIndex = ResolveResult & {
  retriever: BestAnswerRetriever;
  fingerprint: string;
  builtAt: string;
  // Latest Best Answer change, as opposed to when this process rebuilt the index.
  updatedAt: string | null;
};

const cache = new Map<string, Promise<BestAnswerIndex>>();

async function stamp(file: string) {
  const stat = await fs.stat(file).catch(() => null);
  return stat ? `${stat.mtimeMs}:${stat.size}` : "missing";
}

// Changes when a selection is added/removed or any referenced session file is rewritten (e.g. a polished answer).
export async function indexFingerprint(dataDir = steadyDataDir()) {
  const { selections } = await readBestAnswerSelections(dataDir);
  const sessionIds = [...new Set(Object.values(selections).map((selection) => selection?.sessionId).filter(Boolean))].sort();
  const parts = await Promise.all([stamp(bestAnswersFile(dataDir)), ...sessionIds.map(async (id) => `${id}=${await stamp(sessionFile(dataDir, id))}`)]);
  return parts.join("|");
}

function latest(answers: ResolvedBestAnswer[]) {
  return answers.reduce<string | null>((max, answer) => (!max || Date.parse(answer.updatedAt) > Date.parse(max) ? answer.updatedAt : max), null);
}

async function build(dataDir: string, fingerprint: string): Promise<BestAnswerIndex> {
  const resolved = await getResolvedBestAnswers(dataDir);
  // Identifiers only: never log answer bodies.
  for (const warning of resolved.warnings) console.warn(`[best-answers] ${warning.code} questionId=${warning.questionId}${warning.sessionId ? ` sessionId=${warning.sessionId}` : ""}`);
  return { ...resolved, retriever: createLexicalRetriever(resolved.answers), fingerprint, builtAt: new Date().toISOString(), updatedAt: latest(resolved.answers) };
}

// The corpus is small (tens of answers), so a full rebuild on any change is cheaper than tracking per-entry diffs.
export async function getBestAnswerIndex(dataDir = steadyDataDir()): Promise<BestAnswerIndex> {
  const fingerprint = await indexFingerprint(dataDir);
  const cached = cache.get(dataDir);
  if (cached) {
    const index = await cached.catch(() => null);
    if (index?.fingerprint === fingerprint) return index;
  }
  const next = build(dataDir, fingerprint);
  cache.set(dataDir, next);
  return next;
}
