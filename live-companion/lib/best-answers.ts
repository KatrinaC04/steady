import { promises as fs } from "fs";
import { bestAnswersFile, sessionFile, steadyDataDir } from "./config";
import bank from "./steady/question-bank.json";
import { QUESTION_MOTHERS, inferMotherId, questionTwist } from "./steady/question-map";
import type { InterviewAnswer, Session } from "./steady/types";

export type BestAnswerSelection = { sessionId: string; createdAt: string };
export type BestAnswerSelections = Record<string, BestAnswerSelection>;
type BankItem = { id: string; category: string; prompt: string; source: "candidate-reported" | "structured-bank" };

export type AnswerTextSource = "polishedAnswer" | "repairedTranscript" | "transcript";

export type ResolvedBestAnswer = {
  questionId: string;
  canonicalQuestion: string;
  attemptedQuestion: string;
  category: string;
  source: BankItem["source"] | "saved-variation";
  motherId: string;
  twist: string;
  answerText: string;
  answerTextSource: AnswerTextSource;
  sessionId: string;
  answerCreatedAt: string;
  updatedAt: string;
};

export type ResolveWarningCode = "selections-unreadable" | "invalid-selection" | "session-missing" | "answer-missing" | "empty-answer";
// Warnings carry identifiers only, never answer text, so they are safe to log and to return to the browser.
export type ResolveWarning = { questionId: string; code: ResolveWarningCode; sessionId?: string; createdAt?: string };
export type ResolveResult = { answers: ResolvedBestAnswer[]; warnings: ResolveWarning[] };

const BANK = new Map((bank as BankItem[]).map((item) => [item.id, item]));
const MOTHER_BY_QUESTION = new Map(QUESTION_MOTHERS.flatMap((mother) => mother.questionIds.map((id) => [id, mother.id] as const)));

export function canonicalBankItem(questionId: string) {
  return BANK.get(questionId);
}

export function pickAnswerText(answer: Pick<InterviewAnswer, AnswerTextSource>): { text: string; source: AnswerTextSource } | null {
  for (const source of ["polishedAnswer", "repairedTranscript", "transcript"] as const) {
    const text = answer[source]?.trim();
    if (text) return { text, source };
  }
  return null;
}

export async function readBestAnswerSelections(dataDir = steadyDataDir()): Promise<{ selections: BestAnswerSelections; readable: boolean }> {
  try {
    const parsed = JSON.parse(await fs.readFile(bestAnswersFile(dataDir), "utf8"));
    return { selections: parsed && typeof parsed === "object" ? parsed : {}, readable: true };
  } catch (error) {
    // A missing file simply means no Best Answers have been chosen yet.
    return { selections: {}, readable: (error as NodeJS.ErrnoException).code === "ENOENT" };
  }
}

async function loadSession(dataDir: string, sessionId: string): Promise<{ session: Session; mtime: Date } | null> {
  try {
    const file = sessionFile(dataDir, sessionId);
    const [raw, stat] = await Promise.all([fs.readFile(file, "utf8"), fs.stat(file)]);
    return { session: JSON.parse(raw) as Session, mtime: stat.mtime };
  } catch {
    return null;
  }
}

export async function getResolvedBestAnswers(dataDir = steadyDataDir()): Promise<ResolveResult> {
  const { selections, readable } = await readBestAnswerSelections(dataDir);
  const warnings: ResolveWarning[] = readable ? [] : [{ questionId: "*", code: "selections-unreadable" }];
  const sessions = new Map<string, Promise<Awaited<ReturnType<typeof loadSession>>>>();
  const answers: ResolvedBestAnswer[] = [];

  for (const [questionId, selection] of Object.entries(selections)) {
    if (!selection?.sessionId || !selection?.createdAt) { warnings.push({ questionId, code: "invalid-selection" }); continue; }
    const { sessionId, createdAt } = selection;
    if (!sessions.has(sessionId)) sessions.set(sessionId, loadSession(dataDir, sessionId));
    const loaded = await sessions.get(sessionId)!;
    if (!loaded) { warnings.push({ questionId, code: "session-missing", sessionId }); continue; }
    const answer = loaded.session.answers?.find((item) => item.createdAt === createdAt);
    if (!answer) { warnings.push({ questionId, code: "answer-missing", sessionId, createdAt }); continue; }
    const picked = pickAnswerText(answer);
    if (!picked) { warnings.push({ questionId, code: "empty-answer", sessionId, createdAt }); continue; }

    const bankItem = BANK.get(questionId);
    const attemptedQuestion = answer.question?.trim() || bankItem?.prompt || "";
    const canonicalQuestion = bankItem?.prompt || attemptedQuestion;
    const category = bankItem?.category || "Saved AI variation";
    const updatedAt = [createdAt, answer.polishReview?.reviewedAt, loaded.mtime.toISOString()]
      .filter((value): value is string => Boolean(value))
      .reduce((latest, value) => (Date.parse(value) > Date.parse(latest) ? value : latest));

    answers.push({
      questionId,
      canonicalQuestion,
      attemptedQuestion,
      category,
      source: bankItem?.source || "saved-variation",
      motherId: MOTHER_BY_QUESTION.get(questionId) || inferMotherId(`${canonicalQuestion} ${attemptedQuestion}`),
      twist: questionTwist(category, canonicalQuestion),
      answerText: picked.text,
      answerTextSource: picked.source,
      sessionId,
      answerCreatedAt: createdAt,
      updatedAt,
    });
  }
  return { answers, warnings };
}
