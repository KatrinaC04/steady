import { NextResponse } from "next/server";
import { generateBehavioralQuestionRecord, generateCaseFeedback, generateFinalFeedback, generateQuestion, repairASRTranscript } from "@/lib/interviewer";
import { getSession, saveSession } from "@/lib/store";
import type { AnswerMetrics } from "@/lib/types";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  return session
    ? NextResponse.json(session)
    : NextResponse.json({ error: "Session not found" }, { status: 404 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  const body = (await request.json()) as { metrics?: AnswerMetrics; complete?: boolean; notes?: string; screenImage?: string; sessionElapsedSeconds?: number; questionOverride?: string; questionKeyOverride?: string; retry?: boolean };

  if (body.metrics) {
    const question = body.questionOverride || session.questions.at(-1) || "";
    const rawTranscript = body.metrics.transcript; const repairedTranscript = session.config.track === "behavioral" ? await repairASRTranscript(rawTranscript, question, session.config) : undefined;
    const feedback = await generateCaseFeedback(session.config, session.answers, repairedTranscript || rawTranscript, body.notes, body.screenImage, question, rawTranscript);
    const currentMeta = session.questionMeta?.at(-1); const parentQuestionId = body.questionKeyOverride || currentMeta?.parentId;
    session.answers.push({ ...body.metrics, question, repairedTranscript, notes: body.notes, feedback, parentQuestionId, createdAt: new Date().toISOString() });
    if (!body.complete && !body.retry) {
      if (session.config.track === "behavioral") { const generated = await generateBehavioralQuestionRecord(session.config, session.answers); session.questions.push(generated.text); session.questionMeta = [...(session.questionMeta || []), generated]; }
      else session.questions.push(await generateQuestion(session.config, session.answers, { casePrompt: session.casePrompt, createdAt: session.createdAt, elapsedSeconds: body.sessionElapsedSeconds }));
    }
  }
  if (body.complete) {
    session.completedAt = new Date().toISOString();
    session.finalFeedback = await generateFinalFeedback(session);
  }
  await saveSession(session);
  return NextResponse.json(session);
}
