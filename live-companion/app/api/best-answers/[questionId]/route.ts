import { NextResponse } from "next/server";
import { getBestAnswerIndex } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Full text of one Best Answer, for the "view original Best Answer" action.
export async function GET(_request: Request, { params }: { params: Promise<{ questionId: string }> }) {
  const { questionId } = await params;
  const answer = (await getBestAnswerIndex()).answers.find((item) => item.questionId === questionId);
  if (!answer) return NextResponse.json({ error: "Best Answer not found." }, { status: 404 });
  return NextResponse.json(answer);
}
