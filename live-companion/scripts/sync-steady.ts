// Refreshes the vendored Steady snapshot in lib/steady/ from the parent Steady app.
// Steady stays the source of truth; this project only reads it.
import { promises as fs } from "fs";
import path from "path";
import { pathToFileURL } from "url";

const root = path.resolve(__dirname, "..");
const steadyDir = path.resolve(root, process.env.STEADY_PROJECT_DIR || "..");
const outDir = path.join(root, "lib", "steady");
const header = (source: string) => `// Vendored from Steady (${source}) by \`npm run sync:steady\`. Do not edit by hand.\n`;

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  for (const file of ["types.ts", "question-map.ts"]) {
    const source = await fs.readFile(path.join(steadyDir, "lib", file), "utf8");
    await fs.writeFile(path.join(outDir, file), header(`lib/${file}`) + source);
  }
  const interviewer = await import(pathToFileURL(path.join(steadyDir, "lib", "interviewer.ts")).href);
  const bank = interviewer.getBehavioralQuestionBank();
  await fs.writeFile(path.join(outDir, "question-bank.json"), JSON.stringify(bank, null, 2) + "\n");
  console.log(`Synced ${bank.length} canonical questions, types.ts and question-map.ts from ${steadyDir}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
