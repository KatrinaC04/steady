// Measures retrieval quality against the real Steady data: npm run eval [-- --holdout] [-- --verbose]
import "./env";
import { readFileSync } from "fs";
import path from "path";
import { getBestAnswerIndex } from "../lib/retrieval";

type Corpus = { positives: { query: string; expected: string[] }[]; negatives: string[] };

const percentile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)] ?? 0;
};
const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

async function main() {
  const verbose = process.argv.includes("--verbose");
  const file = process.argv.includes("--holdout") ? "holdout.json" : "prompts.json";
  const corpus = JSON.parse(readFileSync(path.join(__dirname, "..", "eval", file), "utf8")) as Corpus;
  const index = await getBestAnswerIndex();
  const available = new Map(index.answers.map((answer) => [answer.questionId, answer]));
  const latencies: number[] = [];
  let answerHits = 0, themeHits = 0, top1Hits = 0, confidentHits = 0, evaluated = 0;
  const misses: string[] = [];
  const positiveTop: number[] = [];

  for (const { query, expected } of corpus.positives) {
    const present = expected.filter((id) => available.has(id));
    if (!present.length) { console.log(`skip (no Best Answer for ${expected.join(", ")}): ${query}`); continue; }
    evaluated += 1;
    const response = index.retriever.search({ query, limit: 3 });
    latencies.push(response.latencyMs);
    const ids = response.results.map((hit) => hit.questionId);
    const hit = ids.some((id) => present.includes(id));
    const expectedMothers = new Set(present.map((id) => available.get(id)!.motherId));
    answerHits += Number(hit);
    top1Hits += Number(present.includes(ids[0]));
    confidentHits += Number(response.confident);
    const themeHit = response.detectedThemes.slice(0, 3).some((theme) => expectedMothers.has(theme.motherId));
    themeHits += Number(themeHit);
    positiveTop.push(present.includes(ids[0]) ? response.results[0].score : 0);
    if (!hit || !themeHit || verbose) {
      const themes = response.detectedThemes.map((theme) => theme.motherId).join(", ") || "none";
      misses.push(`${hit ? "ok  " : "MISS"} ${themeHit ? "" : "[theme] "}${query}\n     expected ${present.join(", ")} [${[...expectedMothers].join(", ")}] · got ${response.results.map((r) => `${r.questionId}(${r.score})`).join(", ")} · themes ${themes}`);
    }
  }

  const negatives = corpus.negatives.map((query) => ({ query, response: index.retriever.search({ query, limit: 3 }) }));
  const falseConfident = negatives.filter(({ response }) => response.confident).map(({ query }) => query);
  const negativeTop = negatives.map(({ response }) => response.results[0]?.score || 0);

  console.log(misses.join("\n"));
  console.log(`\n${file} · retriever ${index.retriever.kind} · ${index.answers.length} Best Answers · ${evaluated} labeled prompts`);
  console.log(`Answer Recall@3   ${pct(answerHits / evaluated)}  (target ≥ 85%)`);
  console.log(`Answer Top-1      ${pct(top1Hits / evaluated)}`);
  console.log(`Theme Recall@3    ${pct(themeHits / evaluated)}  (target ≥ 90%)`);
  console.log(`Correct top-1 score P10 ${percentile(positiveTop.filter(Boolean), 10).toFixed(3)} · P25 ${percentile(positiveTop.filter(Boolean), 25).toFixed(3)}`);
  console.log(`Confident (pos)   ${pct(confidentHits / evaluated)}`);
  console.log(`Confident (neg)   ${falseConfident.length}/${corpus.negatives.length}${falseConfident.length ? `  → ${falseConfident.join(" | ")}` : ""}`);
  console.log(`Negative top-1     max ${Math.max(...negativeTop).toFixed(3)} · threshold ${index.retriever.search({ query: "x" }).threshold}`);
  console.log(`Search latency    P50 ${percentile(latencies, 50).toFixed(2)} ms · P95 ${percentile(latencies, 95).toFixed(2)} ms  (target P95 ≤ 800 ms)`);
}

main().catch((error) => { console.error(error); process.exit(1); });
