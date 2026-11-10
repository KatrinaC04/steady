import { NextResponse } from "next/server";
import { casePromptOrigin, generateBehavioralQuestionRecord, generateQuestion } from "@/lib/interviewer";
import { saveSession } from "@/lib/store";
import type { InterviewConfig, Session } from "@/lib/types";

export async function POST(request: Request) {
  const config = (await request.json()) as InterviewConfig;
  if (!config.role?.trim()) return NextResponse.json({ error: "Role is required" }, { status: 400 });

  const session: Session = {
    id: crypto.randomUUID(),
    config: { ...config, track: config.track || "behavioral", caseType: config.caseType || "mixed", coachingMode: config.coachingMode || "silent", shareScreen: Boolean(config.shareScreen), voiceConversation: config.voiceConversation !== false },
    questions: [],
    answers: [],
    createdAt: new Date().toISOString(),
  };
  if (session.config.track === "behavioral") {
    const generated = await generateBehavioralQuestionRecord(session.config, [], session.config.startingQuestionId, session.config.startingQuestionText);
    session.questions.push(generated.text); session.questionMeta = [generated];
  } else {
    session.questions.push(await generateQuestion(config, [])); session.casePrompt = session.questions[0]; session.casePromptOrigin = casePromptOrigin(session.casePrompt);
  }
  await saveSession(session);
  return NextResponse.json(session);
}
