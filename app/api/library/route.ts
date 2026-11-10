import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getBehavioralQuestionBank, getCaseQuestionBank } from "@/lib/interviewer";
import { behavioralQuestionOrder } from "@/lib/question-order";
import { getBestAnswerSelections } from "@/lib/store";
import type { InterviewAnswer, Session } from "@/lib/types";

export const runtime = "nodejs";

type SavedAttempt = InterviewAnswer & { sessionId: string };

function compactAttempt(attempt: SavedAttempt) {
  return {
    sessionId: attempt.sessionId,
    createdAt: attempt.createdAt,
    transcript: attempt.transcript,
    repairedTranscript: attempt.repairedTranscript,
    polishedAnswer: attempt.polishedAnswer,
    polishReview: attempt.polishReview,
    entrySource: attempt.entrySource,
    wpm: attempt.wpm,
    feedback: attempt.feedback ? {
      score: attempt.feedback.score,
      strength: attempt.feedback.strength,
      correction: attempt.feedback.correction,
    } : undefined,
  };
}

export async function GET(request: Request) {
  const summaryOnly = new URL(request.url).searchParams.get("summary") === "1";
  const bank = getBehavioralQuestionBank();
  const bestSelections = await getBestAnswerSelections();
  const byId = new Map(bank.map((item) => [item.id, { ...item, attempts: [] as SavedAttempt[] }]));
  const legacy = new Map<string, { id: string; primaryCategory: "Behavioral"; secondaryCategory: string; category: string; prompt: string; source: "saved-variation"; attempts: SavedAttempt[] }>();
  const dataDir = path.join(process.cwd(), "data");
  const files = (await fs.readdir(dataDir).catch(() => [] as string[])).filter((name) => name.endsWith(".json"));
  const sessions = (await Promise.all(files.map(async (file) => {
    try { return JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8")) as Session; }
    catch { return null; }
  }))).filter((session): session is Session => Boolean(session?.config && Array.isArray(session.answers)));
  for (const session of sessions) {
    if (session.config.track !== "behavioral") continue;
    for (const answer of session.answers) {
      const attempt = { ...answer, sessionId: session.id };
      if (answer.parentQuestionId && byId.has(answer.parentQuestionId)) byId.get(answer.parentQuestionId)!.attempts.push(attempt);
      else {
        const id = `saved-${Buffer.from(answer.question).toString("base64url").slice(0, 24)}`;
        if (!legacy.has(id)) legacy.set(id, { id, primaryCategory: "Behavioral", secondaryCategory: "Saved AI variations", category: "Saved AI variation", prompt: answer.question, source: "saved-variation", attempts: [] });
        legacy.get(id)!.attempts.push(attempt);
      }
    }
  }
  const summarize = <T extends { id: string; attempts: SavedAttempt[] }>(item: T) => {
    const { attempts: storedAttempts, ...base } = item;
    const attempts = [...storedAttempts].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    const selected = bestSelections[item.id];
    const bestAttempt = selected ? attempts.find((attempt) => attempt.sessionId === selected.sessionId && attempt.createdAt === selected.createdAt) || null : null;
    return {
      ...base,
      attemptCount: attempts.length,
      bestAttempt: bestAttempt ? compactAttempt(bestAttempt) : null,
      latestCreatedAt: attempts[0]?.createdAt || "",
      attempts: summaryOnly ? [] : attempts.map(compactAttempt),
    };
  };
  const questions = [...byId.values()]
    .map(summarize)
    .sort((a, b) => behavioralQuestionOrder(a.id) - behavioralQuestionOrder(b.id));
  const savedVariations = [...legacy.values()]
    .map(summarize)
    .sort((a, b) => Date.parse(b.latestCreatedAt) - Date.parse(a.latestCreatedAt));
  const caseQuestions = getCaseQuestionBank().map((item) => ({ ...item, attemptCount: 0, bestAttempt: null, latestCreatedAt: "", attempts: [] }));
  return NextResponse.json({ questions, savedVariations, caseQuestions }, { headers: { "Cache-Control": "no-store" } });
}
