import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import type { InterviewAnswer, Session } from "@/lib/steady/types";

export function answer(overrides: Partial<InterviewAnswer> & Pick<InterviewAnswer, "question" | "createdAt">): InterviewAnswer {
  return { words: 0, durationSeconds: 0, wpm: 0, gazeScore: 0, gazeAwaySeconds: 0, transcript: "", ...overrides };
}

export function session(id: string, answers: InterviewAnswer[]): Session {
  return {
    id,
    config: { role: "PM Intern", company: "Microsoft", resume: "", jobDescription: "", language: "English", promptMode: "none", duration: 5, saveRecording: false, showGazeDot: false, track: "behavioral", caseType: "mixed", coachingMode: "silent", shareScreen: false, voiceConversation: false },
    questions: answers.map((item) => item.question),
    answers,
    createdAt: answers[0]?.createdAt || "2026-10-01T00:00:00.000Z",
  };
}

// A throwaway Steady data directory: sessions at the root, selections in preferences/best-answers.json.
export function tempDataDir() {
  const dir = mkdtempSync(path.join(os.tmpdir(), "steady-data-"));
  mkdirSync(path.join(dir, "preferences"));
  let tick = Date.now() / 1000;
  // Bump mtimes explicitly so rapid successive writes always change the index fingerprint.
  const touch = (file: string) => { tick += 10; utimesSync(file, tick, tick); };
  return {
    dir,
    writeSession(value: Session) { const file = path.join(dir, `${value.id}.json`); writeFileSync(file, JSON.stringify(value)); touch(file); },
    writeSelections(value: unknown) { const file = path.join(dir, "preferences", "best-answers.json"); writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value)); touch(file); },
    cleanup() { rmSync(dir, { recursive: true, force: true }); },
  };
}
