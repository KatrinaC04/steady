import { NextResponse } from "next/server";
import { getBestAnswerIndex } from "@/lib/retrieval";
import type { SearchRequest } from "@/lib/retrieval/types";

export const runtime = "nodejs";

const MAX_QUERY_CHARS = 2000;

function parse(body: unknown): SearchRequest | string {
  if (!body || typeof body !== "object") return "Request body must be a JSON object.";
  const { query, language, limit, conversationContext } = body as Record<string, unknown>;
  if (typeof query !== "string" || !query.trim()) return "query is required.";
  if (query.length > MAX_QUERY_CHARS) return `query must be at most ${MAX_QUERY_CHARS} characters.`;
  if (limit !== undefined && (!Number.isInteger(limit) || (limit as number) < 1 || (limit as number) > 10)) return "limit must be an integer from 1 to 10.";
  if (conversationContext !== undefined && (!Array.isArray(conversationContext) || conversationContext.some((turn) => typeof turn !== "string"))) return "conversationContext must be an array of strings.";
  return {
    query,
    language: typeof language === "string" ? language : undefined,
    limit: limit as number | undefined,
    conversationContext: (conversationContext as string[] | undefined)?.slice(-3).map((turn) => turn.slice(0, MAX_QUERY_CHARS)),
  };
}

export async function POST(request: Request) {
  const parsed = parse(await request.json().catch(() => null));
  if (typeof parsed === "string") return NextResponse.json({ error: parsed }, { status: 400 });
  const index = await getBestAnswerIndex();
  if (!index.answers.length) return NextResponse.json({ error: "No Best Answers are selected yet. Choose Best Answers in Steady's Question Bank first.", code: "no-best-answers" }, { status: 409 });
  return NextResponse.json({ ...index.retriever.search(parsed), indexSize: index.answers.length });
}
