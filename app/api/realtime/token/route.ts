import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
  if (!apiKey) return NextResponse.json({ error: "OpenAI API key is not configured." }, { status: 500 });

  const body = await request.json().catch(() => ({})) as { language?: string };
  const language = body.language === "中文" ? "zh" : "en";
  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      session: {
        type: "realtime",
        model: "gpt-realtime-2.1",
        output_modalities: ["audio"],
        instructions: "You are the voice layer for an interview application. Never initiate a response on your own. When asked to speak supplied interviewer text, say only that text in a calm, concise, professional interviewer voice.",
        audio: {
          input: {
            transcription: { model: "gpt-4o-mini-transcribe", language },
            noise_reduction: { type: "near_field" },
            turn_detection: null
          },
          output: { voice: "marin" }
        }
      }
    })
  });
  const data = await response.json();
  if (!response.ok) return NextResponse.json({ error: data?.error?.message || "Could not create a Realtime session." }, { status: response.status });
  return NextResponse.json(data);
}
