// Transcription-only Realtime session for meeting audio. Server VAD marks speech start/stop;
// create_response is off, so the model never answers or speaks.

export type CompanionLanguage = "English" | "中文" | "Bilingual";
export type AudioSourceKind = "tab" | "screen" | "microphone";

export const VAD_SILENCE_RANGE = { min: 400, max: 1200, default: 600 } as const;

const TRANSCRIPTION_HINT = "A behavioral or product-management mock interview. The interviewer asks questions about experience, leadership, conflict, prioritization, metrics, AI, and product judgment.";

export function realtimeSessionConfig(options: { language?: string; silenceMs?: number; source?: string }) {
  const language = options.language === "中文" ? "zh" : options.language === "English" ? "en" : undefined;
  const silence = Math.round(Math.min(VAD_SILENCE_RANGE.max, Math.max(VAD_SILENCE_RANGE.min, Number(options.silenceMs) || VAD_SILENCE_RANGE.default)));
  return {
    type: "realtime",
    model: process.env.REALTIME_MODEL || "gpt-realtime-2.1",
    output_modalities: ["text"],
    instructions: "You are a silent transcription layer. Never respond.",
    audio: {
      input: {
        // Bilingual leaves language unset so the transcriber auto-detects mixed Chinese and English.
        transcription: { model: process.env.REALTIME_TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe", ...(language ? { language } : {}), prompt: TRANSCRIPTION_HINT },
        // Shared tab/system audio is already clean; only a room microphone benefits from noise reduction.
        noise_reduction: options.source === "microphone" ? { type: "far_field" } : null,
        turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: silence, create_response: false, interrupt_response: false },
      },
    },
  };
}
