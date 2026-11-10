import { NextResponse } from "next/server";
import { getSession, recordingFile, saveRecording, saveSession } from "@/lib/store";
import { promises as fs } from "fs";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (!session.config.saveRecording) return NextResponse.json({ error: "Recording disabled" }, { status: 403 });

  const data = await request.formData();
  const file = data.get("recording");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing recording" }, { status: 400 });
  if (file.size > 250 * 1024 * 1024) return NextResponse.json({ error: "Recording too large" }, { status: 413 });
  const ext = file.type.includes("mp4") ? "mp4" : "webm";
  session.recordingPath = await saveRecording(id, new Uint8Array(await file.arrayBuffer()), ext);
  await saveSession(session);
  return NextResponse.json({ ok: true });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession(id);
  if (!session?.recordingPath) return new NextResponse(null, { status: 404 });
  const bytes = await fs.readFile(recordingFile(session.recordingPath));
  return new NextResponse(bytes, {
    headers: { "Content-Type": session.recordingPath.endsWith("mp4") ? "video/mp4" : "video/webm" },
  });
}
