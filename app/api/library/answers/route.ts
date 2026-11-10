import { NextResponse } from "next/server";
import { getBehavioralQuestionBank } from "@/lib/interviewer";
import { clearBestAnswerSelection, deleteSession, getSession, saveSession, setBestAnswerSelection } from "@/lib/store";
import type { InterviewConfig, Session } from "@/lib/types";

const manualConfig: InterviewConfig = { role: "Product Manager Intern", company: "Microsoft", resume: "", jobDescription: "", language: "English", promptMode: "none", duration: 5, saveRecording: false, showGazeDot: false, track: "behavioral", caseType: "mixed", coachingMode: "silent", shareScreen: false, voiceConversation: false };

export async function POST(request: Request) {
  const body = await request.json() as { questionId?: string; question?: string; transcript?: string };
  const transcript = body.transcript?.trim(); const question = body.question?.trim();
  if (!body.questionId || !question || !transcript) return NextResponse.json({ error: "Question and answer are required." }, { status: 400 });
  const bankItem = getBehavioralQuestionBank().find((item) => item.id === body.questionId);
  const now = new Date().toISOString();
  const session: Session = { id: crypto.randomUUID(), config: { ...manualConfig, startingQuestionId: body.questionId, startingQuestionText: question }, questions: [question], questionMeta: [{ text: question, parentId: body.questionId, parentPrompt: bankItem?.prompt || question, category: bankItem?.category || "Saved variation", source: bankItem?.source || "ai-variant" }], answers: [{ question, transcript, repairedTranscript: transcript, entrySource: "manual", words: transcript.split(/\s+/).length, durationSeconds: 0, wpm: 0, gazeScore: 0, gazeAwaySeconds: 0, parentQuestionId: body.questionId, createdAt: now }], createdAt: now };
  await saveSession(session);
  return NextResponse.json({ ok: true, sessionId: session.id });
}

export async function DELETE(request: Request) {
  const body = await request.json() as { questionId?: string; sessionId?: string; createdAt?: string };
  if (!body.sessionId || !body.createdAt) return NextResponse.json({ error: "Attempt identifier is required." }, { status: 400 });
  const session = await getSession(body.sessionId); if (!session) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  const before = session.answers.length; session.answers = session.answers.filter((answer) => answer.createdAt !== body.createdAt);
  if (session.answers.length === before) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  if (body.questionId) await clearBestAnswerSelection(body.questionId, { sessionId: body.sessionId, createdAt: body.createdAt });
  if (!session.answers.length) await deleteSession(session.id, session.recordingPath); else await saveSession(session);
  return NextResponse.json({ ok: true });
}

export async function PUT(request: Request) {
  const body = await request.json() as { questionId?: string; sessionId?: string; createdAt?: string };
  if (!body.questionId || !body.sessionId || !body.createdAt) return NextResponse.json({ error: "Question and attempt identifiers are required." }, { status: 400 });
  const session = await getSession(body.sessionId);
  if (!session?.answers.some((answer) => answer.createdAt === body.createdAt)) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  await setBestAnswerSelection(body.questionId, { sessionId: body.sessionId, createdAt: body.createdAt });
  return NextResponse.json({ ok: true });
}
