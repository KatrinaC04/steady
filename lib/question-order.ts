const OPENING_SEQUENCE = [
  "msft-reported-14", // Tell me about yourself
  "msft-reported-15", // Why Microsoft / why this role
  "competency-39",    // Why PM
  "msft-reported-5",  // Resume walkthrough
  "msft-reported-1",  // Favorite internship
  "msft-reported-3",  // Effective PM
  "msft-reported-2",  // What makes a product good
  "msft-reported-8",  // Favorite Microsoft product
  "msft-reported-4",  // Favorite app
  "msft-reported-7",  // Strength and weakness
] as const;

const CORE_BEHAVIORAL_SEQUENCE = [
  "msft-reported-9",  // Leadership
  "competency-1",     // Leadership without authority
  "msft-reported-6",  // Conflict
  "competency-2",     // Stakeholder conflict
  "competency-3",     // Failure and learning
  "competency-4",     // Prioritization
  "competency-5",     // Customer focus
  "competency-6",     // Data-driven decision
  "competency-7",     // Ambiguity
  "competency-8",     // Cross-functional collaboration
  "competency-9",     // Communication and persuasion
  "competency-10",    // Fast-paced execution
  "competency-11",    // Feedback
  "competency-13",    // Innovation
  "competency-14",    // Zero to one
  "competency-15",    // Process redesign
  "competency-16",    // Calculated risk
  "competency-17",    // Disagree and commit
  "competency-18",    // Delayed project
  "competency-19",    // Quality versus speed
  "competency-20",    // Ethics
  "competency-21",    // Inclusive collaboration
  "competency-22",    // Learning a domain
  "competency-40",    // Beyond assigned scope
  "competency-41",    // Using AI at work
] as const;

const PRODUCT_AND_TECH_SEQUENCE = [
  "competency-33",    // Favorite product
  "competency-34",    // Favorite Microsoft product
  "competency-35",    // Product taste
  "competency-36",    // Technology trends
  "competency-37",    // Go to market
  "competency-38",    // Strength / weakness variation
  "msft-reported-10",
  "msft-reported-11",
  "msft-reported-12",
  "msft-reported-13",
  "msft-reported-16",
  "msft-reported-17",
  "msft-reported-18",
  "msft-reported-19",
  "msft-reported-20",
  "msft-reported-21",
  "competency-29",
  "competency-30",
  "competency-31",
  "competency-32",
] as const;

const SITUATIONAL_SEQUENCE = [
  "competency-23",
  "competency-24",
  "competency-25",
  "competency-26",
  "competency-27",
  "competency-28",
] as const;

const ORDER = new Map<string, number>(
  [...OPENING_SEQUENCE, ...CORE_BEHAVIORAL_SEQUENCE, ...PRODUCT_AND_TECH_SEQUENCE, ...SITUATIONAL_SEQUENCE]
    .map((id, index) => [id, index]),
);

export function behavioralQuestionOrder(id: string) {
  const explicit = ORDER.get(id);
  if (explicit !== undefined) return explicit;
  if (id.startsWith("cv-deep-dive-")) return 800 + Number(id.split("-").at(-1) || 0);
  if (id.startsWith("saved-")) return 1000;
  return 700;
}

