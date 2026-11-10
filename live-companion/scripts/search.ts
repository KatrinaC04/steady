// Ad-hoc retrieval check: npm run search -- "Tell me about a time you disagreed with a stakeholder"
import "./env";
import { getBestAnswerIndex } from "../lib/retrieval";

async function main() {
  const query = process.argv.slice(2).join(" ");
  if (!query) throw new Error('Usage: npm run search -- "<interviewer question>"');
  const index = await getBestAnswerIndex();
  const response = index.retriever.search({ query, limit: 3 });
  console.log(`${index.answers.length} Best Answers, ${index.warnings.length} warnings · confident=${response.confident} · ${response.latencyMs} ms`);
  console.log(`themes: ${response.detectedThemes.map((theme) => `${theme.motherId}(${theme.score.toFixed(2)})`).join(", ") || "none"}`);
  for (const hit of response.results) {
    const c = hit.components;
    console.log(`${hit.score.toFixed(3)}  ${hit.questionId.padEnd(22)} [${hit.motherId}] ${hit.attemptedQuestion.slice(0, 80)}`);
    console.log(`        sem=${c.semanticSimilarity} canon=${c.canonicalQuestionSimilarity} theme=${c.motherThemeMatch} entity=${c.keywordEntityOverlap}`);
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
