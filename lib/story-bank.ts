import { promises as fs } from "fs";
import path from "path";

export type StoryDefinition = { id: string; title: string; organization: string; summary: string; facts: string[]; patterns: RegExp[]; excludedCompetencies?: string[] };
type StoredStoryDefinition = Omit<StoryDefinition, "patterns"> & { patterns: string[] };

const DEFAULT_STORIES: StoredStoryDefinition[] = [
  { id: "example-launch", title: "Zero-to-One Product Launch", organization: "Example Company", summary: "Replace this example with a product or project from your own experience.", facts: ["Defined the user problem", "Prioritized an MVP", "Measured the launch"], patterns: ["product launch", "zero.to.one", "MVP"] },
  { id: "example-alignment", title: "Cross-Functional Alignment", organization: "Example Company", summary: "Replace this example with a story about aligning people around a difficult trade-off.", facts: ["Different stakeholder priorities", "Shared decision criteria", "Documented outcome"], patterns: ["stakeholder", "conflict", "alignment", "trade.off"] },
];

function compile(stories: StoredStoryDefinition[]): StoryDefinition[] {
  return stories.map((story) => ({ ...story, patterns: story.patterns.map((pattern) => new RegExp(pattern, "i")) }));
}

export async function getStoryBank() {
  try {
    const file = path.join(process.cwd(), "data", "profile", "stories.json");
    const stored = JSON.parse(await fs.readFile(file, "utf8")) as StoredStoryDefinition[];
    return compile(stored);
  } catch {
    return compile(DEFAULT_STORIES);
  }
}

export function identifyStory(text: string, stories: StoryDefinition[]) {
  const ranked = stories.map((story) => ({ story, score: story.patterns.reduce((score, pattern) => score + (pattern.test(text) ? 1 : 0), 0) })).sort((a, b) => b.score - a.score);
  return ranked[0]?.score ? ranked[0].story : undefined;
}
