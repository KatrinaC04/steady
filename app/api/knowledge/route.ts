import { NextResponse } from "next/server";
import { retrieveKnowledge } from "@/lib/knowledge";
import type { ProductCaseType } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as { query?: string; caseType?: ProductCaseType; limit?: number };
  return NextResponse.json({ chunks: retrieveKnowledge(body.query || "product case interview", body.caseType || "mixed", Math.min(body.limit || 4, 8)) });
}
