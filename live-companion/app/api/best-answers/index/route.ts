import { NextResponse } from "next/server";
import { getBestAnswerIndex } from "@/lib/retrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Index summary for the Setup screen. `?include=entries` adds per-answer metadata, never answer bodies.
export async function GET(request: Request) {
  const index = await getBestAnswerIndex();
  const includeEntries = new URL(request.url).searchParams.get("include") === "entries";
  return NextResponse.json({
    count: index.answers.length,
    updatedAt: index.updatedAt,
    builtAt: index.builtAt,
    retriever: index.retriever.kind,
    warnings: index.warnings,
    ...(includeEntries ? { entries: index.answers.map(({ answerText, ...metadata }) => ({ ...metadata, words: answerText.split(/\s+/).length })) } : {}),
  });
}
