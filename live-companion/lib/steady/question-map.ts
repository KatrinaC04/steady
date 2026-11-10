// Vendored from Steady (lib/question-map.ts) by `npm run sync:steady`. Do not edit by hand.
export type QuestionMother = {
  id: string;
  title: string;
  corePrompt: string;
  description: string;
  questionIds: string[];
};

// This is deliberately curated rather than generated from the broad category labels.
// Each canonical bank question appears once, under the mother question it is really testing.
export const QUESTION_MOTHERS: QuestionMother[] = [
  {
    id: "motivation",
    title: "Motivation & career narrative",
    corePrompt: "Why this path, role, and company?",
    description: "Use one coherent through-line; change the evidence depending on whether the question asks about your past, the PM role, or Microsoft.",
    questionIds: ["msft-reported-1", "msft-reported-3", "msft-reported-5", "msft-reported-14", "msft-reported-15", "competency-12", "competency-39"],
  },
  {
    id: "leadership",
    title: "Leadership & ownership",
    corePrompt: "How did you create momentum without relying on authority?",
    description: "Keep the same ownership story, but move the emphasis among initiative, team direction, inclusion, and recovery.",
    questionIds: ["msft-reported-9", "competency-1", "competency-18", "competency-21", "competency-40", "cv-deep-dive-8"],
  },
  {
    id: "conflict",
    title: "Conflict, influence & alignment",
    corePrompt: "How did you move people with different priorities toward a decision?",
    description: "The reusable spine is disagreement → decision criteria → trade-off → commitment; the twist is who disagreed and what was at stake.",
    questionIds: ["msft-reported-6", "competency-2", "competency-8", "competency-9", "competency-17", "competency-27"],
  },
  {
    id: "ambiguity",
    title: "Ambiguity & zero-to-one",
    corePrompt: "How did you find a path when no playbook or owner existed?",
    description: "Separate discovering the real problem from building the first solution; show how you reduced uncertainty before scaling scope.",
    questionIds: ["competency-7", "competency-14", "competency-23", "competency-28", "cv-deep-dive-12"],
  },
  {
    id: "prioritization",
    title: "Prioritization under constraints",
    corePrompt: "What did you choose, defer, or remove—and why?",
    description: "Reuse the constraint and decision criteria, then twist toward time, capacity, scope, quality, or an explicit product trade-off.",
    questionIds: ["msft-reported-12", "competency-4", "competency-10", "competency-19", "competency-24", "cv-deep-dive-10"],
  },
  {
    id: "learning",
    title: "Failure, feedback & growth",
    corePrompt: "What changed in your judgment after something did not work?",
    description: "A strong answer shows the original belief, disconfirming evidence, the behavioral change, and proof that you applied the lesson later.",
    questionIds: ["msft-reported-10", "competency-3", "competency-11", "competency-38", "cv-deep-dive-14"],
  },
  {
    id: "self-awareness",
    title: "Self-awareness",
    corePrompt: "What do you genuinely do well, and what are you changing?",
    description: "Choose evidence that is observable rather than flattering, then show the concrete habit you use to improve the weakness.",
    questionIds: ["msft-reported-7"],
  },
  {
    id: "customer",
    title: "Customer insight & product judgment",
    corePrompt: "How did you identify a real need and turn it into a product decision?",
    description: "Twist the same customer reasoning toward discovery, expansion, product taste, go-to-market, or a favorite product critique.",
    questionIds: ["msft-reported-2", "msft-reported-4", "msft-reported-8", "msft-reported-11", "msft-reported-13", "msft-reported-20", "competency-5", "competency-33", "competency-34", "competency-35", "competency-36", "competency-37"],
  },
  {
    id: "data",
    title: "Data, experiments & metrics",
    corePrompt: "How did evidence change a recommendation or validate impact?",
    description: "Anchor on the decision—not the analysis alone. Be ready to defend data quality, baselines, causality, guardrails, and metric definitions.",
    questionIds: ["competency-6", "competency-26", "competency-30", "competency-31", "competency-32", "cv-deep-dive-1", "cv-deep-dive-5", "cv-deep-dive-6", "cv-deep-dive-11"],
  },
  {
    id: "innovation",
    title: "Innovation & calculated bets",
    corePrompt: "Why was a non-obvious approach worth trying?",
    description: "Show why the obvious solution was insufficient, what was genuinely uncertain, and how you capped the downside before committing.",
    questionIds: ["competency-13", "competency-16"],
  },
  {
    id: "technical",
    title: "Technical depth & communication",
    corePrompt: "Can you explain what you built, why it worked, and what you personally owned?",
    description: "Use the same technical project at different zoom levels: architecture, tool choice, baseline, failure modes, or a plain-language explanation.",
    questionIds: ["msft-reported-16", "msft-reported-17", "msft-reported-18", "msft-reported-19", "competency-22", "competency-29", "cv-deep-dive-2", "cv-deep-dive-3", "cv-deep-dive-4", "cv-deep-dive-7", "cv-deep-dive-9", "cv-deep-dive-13", "cv-deep-dive-15"],
  },
  {
    id: "execution",
    title: "Execution & reliable workflows",
    corePrompt: "How did you make a process faster, clearer, or more dependable?",
    description: "Focus on the before-and-after workflow, the failure point you removed, and the operating metric that proved the redesign mattered.",
    questionIds: ["msft-reported-21", "competency-15"],
  },
  {
    id: "ai-leverage",
    title: "AI leverage & responsible use",
    corePrompt: "How did AI improve your work without replacing your judgment?",
    description: "Name the original workflow, the specific role AI played, how you verified its output, what information or decisions stayed human-owned, and the measurable benefit.",
    questionIds: ["competency-41"],
  },
  {
    id: "judgment",
    title: "Situational product judgment",
    corePrompt: "What would you do when the evidence, people, and constraints conflict?",
    description: "These are hypothetical, so state assumptions, gather the missing signal, make a reversible next move, and name the escalation threshold.",
    questionIds: ["competency-20", "competency-25"],
  },
];

export function inferMotherId(prompt: string) {
  const value = prompt.toLowerCase();
  if (/stakeholder|align|conflict|consensus/.test(value)) return "conflict";
  if (/zero-to-one|from scratch|no prior framework|no established/.test(value)) return "ambiguity";
  if (/numerator|denominator|baseline|causal|metric|experiment|data source/.test(value)) return "data";
  if (/technical|api|framework|algorithm|architecture/.test(value)) return "technical";
  if (/used ai|using ai|ai tool|human judgment/.test(value)) return "ai-leverage";
  if (/deadline|capacity|scope|prioriti|shipping|reliability/.test(value)) return "prioritization";
  if (/customer|user need|favorite product|improve/.test(value)) return "customer";
  return "unmapped";
}

export function questionTwist(category: string, prompt: string) {
  const value = `${category} ${prompt}`.toLowerCase();
  if (value.includes("situational" ) || value.startsWith("imagine")) return "Hypothetical judgment";
  if (/metric|numerator|denominator|baseline/.test(value)) return "Metric defensibility";
  if (/favorite|especially like/.test(value)) return "Product critique";
  if (/technical|api|framework|algorithm/.test(value)) return "Technical depth";
  if (/conflict|disagree|stakeholder/.test(value)) return "Alignment under tension";
  if (/time|capacity|scope|speed|deadline/.test(value)) return "Constraint trade-off";
  if (/failure|did not work|feedback|rebuild/.test(value)) return "Learning loop";
  if (/zero-to-one|no established|unclear|ambig/.test(value)) return "Creating the playbook";
  if (/customer|user need|useful to more/.test(value)) return "User-to-decision link";
  if (/leadership|authority|initiative/.test(value)) return "Personal ownership";
  if (/outside the formal scope|assigned responsibilities/.test(value)) return "Beyond formal scope";
  if (/used ai|using ai|ai tool|human judgment/.test(value)) return "Responsible AI leverage";
  return category.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
