import { NextResponse } from "next/server";
import { polishBehavioralAnswer } from "@/lib/interviewer";
import { getSession, saveSession } from "@/lib/store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json() as { sessionId?: string; createdAt?: string };
  if (!body.sessionId || !body.createdAt) return NextResponse.json({ error: "Attempt identifier is required." }, { status: 400 });
  const session = await getSession(body.sessionId);
  if (!session) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  const answer = session.answers.find((item) => item.createdAt === body.createdAt);
  if (!answer) return NextResponse.json({ error: "Attempt not found." }, { status: 404 });
  const review = await polishBehavioralAnswer(answer.transcript, answer.repairedTranscript || "", answer.question, session.config, answer.feedback);
  answer.polishedAnswer = review.polishedAnswer;
  answer.polishReview = { status: review.status, missingDetails: review.missingDetails, reviewedAt: new Date().toISOString() };
  await saveSession(session);
  return NextResponse.json({ ok: true, polishedAnswer: answer.polishedAnswer, polishReview: answer.polishReview });
}
