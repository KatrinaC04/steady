import { NextResponse } from "next/server";
import { analyzeLiveNotes } from "@/lib/interviewer";
import type { InterviewConfig } from "@/lib/types";

export async function POST(request: Request) {
  const body = (await request.json()) as { config?: InterviewConfig; screenImage?: string; stage?: string };
  if (!body.config || !body.screenImage) return NextResponse.json({ error: "Config and screen image are required" }, { status: 400 });
  return NextResponse.json(await analyzeLiveNotes(body.config, body.screenImage, body.stage || "Case development"));
}
