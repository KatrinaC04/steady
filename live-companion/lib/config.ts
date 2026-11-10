import path from "path";

// Steady's data directory is read-only from this project. Relative paths resolve from the process cwd.
export function steadyDataDir() {
  return path.resolve(process.cwd(), process.env.STEADY_DATA_DIR || "../data");
}

export function bestAnswersFile(dataDir = steadyDataDir()) {
  return path.join(dataDir, "preferences", "best-answers.json");
}

export function sessionFile(dataDir: string, sessionId: string) {
  // Session ids come from a local preferences file, but never let one escape the data directory.
  return path.join(dataDir, `${path.basename(sessionId)}.json`);
}
