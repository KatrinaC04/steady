import { NextResponse } from "next/server";
import { realtimeSessionConfig } from "@/lib/live/realtime-session";

export const runtime = "nodejs";

// Mints a short-lived client secret so the browser can open WebRTC directly. The API key never leaves the server,
// and the secret itself is never logged.
export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OpenAI API key is not configured.", code: "not-configured" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { language?: string; silenceMs?: number; source?: string };
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ session: realtimeSessionConfig(body) }),
  }).catch(() => null);
  if (!response) return NextResponse.json({ error: "Could not reach OpenAI.", code: "network" }, { status: 502 });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn(`[realtime] client secret failed status=${response.status}`);
    return NextResponse.json({ error: data?.error?.message || "Could not create a Realtime session.", code: "upstream" }, { status: response.status });
  }
  return NextResponse.json({ value: data.value, expiresAt: data.expires_at });
}
