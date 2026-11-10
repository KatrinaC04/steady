import { promises as fs } from "fs";
import path from "path";
import type { Session } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const PREFERENCES_DIR = path.join(DATA_DIR, "preferences");
const BEST_ANSWERS_FILE = path.join(PREFERENCES_DIR, "best-answers.json");

export type BestAnswerSelection = { sessionId: string; createdAt: string };
export type BestAnswerSelections = Record<string, BestAnswerSelection>;

async function ensureDirs() {
  await Promise.all([
    fs.mkdir(DATA_DIR, { recursive: true }),
    fs.mkdir(UPLOAD_DIR, { recursive: true }),
  ]);
}

export async function saveSession(session: Session) {
  await ensureDirs();
  await fs.writeFile(path.join(DATA_DIR, `${session.id}.json`), JSON.stringify(session, null, 2));
  return session;
}

export async function getSession(id: string): Promise<Session | null> {
  try {
    return JSON.parse(await fs.readFile(path.join(DATA_DIR, `${id}.json`), "utf8"));
  } catch {
    return null;
  }
}

export async function deleteSession(id: string, recordingPath?: string) {
  await fs.unlink(path.join(DATA_DIR, `${id}.json`)).catch(() => {});
  if (recordingPath) await fs.unlink(recordingFile(recordingPath)).catch(() => {});
}

export async function getBestAnswerSelections(): Promise<BestAnswerSelections> {
  try {
    return JSON.parse(await fs.readFile(BEST_ANSWERS_FILE, "utf8"));
  } catch {
    return {};
  }
}

export async function setBestAnswerSelection(questionId: string, selection: BestAnswerSelection) {
  const selections = await getBestAnswerSelections();
  selections[questionId] = selection;
  await fs.mkdir(PREFERENCES_DIR, { recursive: true });
  await fs.writeFile(BEST_ANSWERS_FILE, JSON.stringify(selections, null, 2));
}

export async function clearBestAnswerSelection(questionId: string, selection?: BestAnswerSelection) {
  const selections = await getBestAnswerSelections();
  const current = selections[questionId];
  if (!current || (selection && (current.sessionId !== selection.sessionId || current.createdAt !== selection.createdAt))) return;
  delete selections[questionId];
  await fs.mkdir(PREFERENCES_DIR, { recursive: true });
  await fs.writeFile(BEST_ANSWERS_FILE, JSON.stringify(selections, null, 2));
}

export async function saveRecording(id: string, bytes: Uint8Array, extension = "webm") {
  await ensureDirs();
  const filename = `${id}.${extension.replace(/[^a-z0-9]/gi, "")}`;
  await fs.writeFile(path.join(UPLOAD_DIR, filename), bytes);
  return filename;
}

export function recordingFile(filename: string) {
  return path.join(UPLOAD_DIR, path.basename(filename));
}
