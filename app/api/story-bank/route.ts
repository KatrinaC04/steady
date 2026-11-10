import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getBehavioralQuestionBank } from "@/lib/interviewer";
import { getStoryBank, identifyStory } from "@/lib/story-bank";
import { getBestAnswerSelections } from "@/lib/store";
import type { InterviewAnswer, Session } from "@/lib/types";

export const runtime = "nodejs";
type StoryAttempt = InterviewAnswer & { sessionId: string; competency: string };

const MOTIVATION_QUESTIONS = [
  { id: "msft-reported-14", label: "Tell me about yourself" },
  { id: "competency-39", label: "Why Product Management" },
  { id: "msft-reported-15", label: "Why Microsoft" },
  { id: "msft-reported-1", label: "Favorite internship" },
  { id: "msft-reported-8", label: "Favorite Microsoft product" },
  { id: "msft-reported-4", label: "Favorite product in general" },
  { id: "msft-reported-3", label: "Effective product manager" },
  { id: "msft-reported-2", label: "What makes a product good" },
  { id: "msft-reported-7", label: "Genuine strength and weakness" },
  { id: "competency-29", label: "Explain a technical term" },
] as const;

function inferCompetency(question: string, questionId: string | undefined, fallback: string) {
  const text = question.toLowerCase();
  const reported: Record<string, string> = {
    "msft-reported-1": "motivation and role fit", "msft-reported-2": "product judgment", "msft-reported-3": "product management judgment",
    "msft-reported-4": "favorite product judgment", "msft-reported-5": "career narrative", "msft-reported-6": "stakeholder conflict and influence",
    "msft-reported-7": "strength and self-awareness", "msft-reported-8": "favorite Microsoft product", "msft-reported-9": "leadership without formal authority",
    "msft-reported-10": "failure, learning, and growth mindset", "msft-reported-11": "customer focus and product judgment", "msft-reported-12": "product trade-offs",
    "msft-reported-13": "product judgment", "msft-reported-14": "career narrative", "msft-reported-15": "motivation and role fit",
    "msft-reported-16": "technical depth", "msft-reported-17": "technical depth", "msft-reported-18": "technical depth",
    "msft-reported-19": "cross-functional technical collaboration", "msft-reported-20": "technology trend judgment", "msft-reported-21": "go-to-market thinking",
  };
  if (questionId && reported[questionId]) return reported[questionId];
  if (!['Microsoft reported', 'Saved variation', 'CV deep dive'].includes(fallback)) return fallback;
  if (/zero.to.one|from scratch|no prior framework|no established playbook/.test(text)) return "zero-to-one product thinking";
  if (/conflict|disagree|differing priorities|align multiple stakeholders/.test(text)) return "stakeholder conflict and influence";
  if (/leadership|lead a team/.test(text)) return "leadership without formal authority";
  if (/metric|numerator|denominator|baseline|causal|calculated/.test(text)) return "metric definition";
  if (/technical project|algorithm|model|api|programming|framework/.test(text)) return "technical depth";
  if (/user need|customer|user problem/.test(text)) return "customer focus and product judgment";
  if (/experiment|analysis|data/.test(text)) return "data-driven decision making";
  if (/trade.off|limited time|capacity|scope|prioriti/.test(text)) return "prioritization under constraints";
  if (/feedback|mistake|did not work|improve if you rebuilt/.test(text)) return "failure, learning, and growth mindset";
  if (/why microsoft|why product|favorite internship|background/.test(text)) return "motivation and role fit";
  return fallback === "CV deep dive" ? "resume deep dive" : "behavioral variation";
}

export async function GET() {
  const storyBank = await getStoryBank();
  const bestSelections = await getBestAnswerSelections();
  const competencyById = new Map(getBehavioralQuestionBank().map((item) => [item.id, item.category]));
  const stories = new Map(storyBank.map((story) => [story.id, { ...story, attempts: [] as StoryAttempt[] }]));
  const motivationAttempts = new Map<string, StoryAttempt[]>(MOTIVATION_QUESTIONS.map((item) => [item.id, []]));
  const unmatched: StoryAttempt[] = [];
  const dataDir = path.join(process.cwd(), "data");
  const files = (await fs.readdir(dataDir).catch(() => [] as string[])).filter((name) => name.endsWith(".json"));
  const sessions = (await Promise.all(files.map(async (file) => {
    try { return JSON.parse(await fs.readFile(path.join(dataDir, file), "utf8")) as Session; }
    catch { return null; }
  }))).filter((session): session is Session => Boolean(session?.config && Array.isArray(session.answers)));
  for (const session of sessions) {
    if (session.config.track !== "behavioral") continue;
    for (const answer of session.answers) {
      const fallback = answer.parentQuestionId ? competencyById.get(answer.parentQuestionId) || "Behavioral" : "Saved variation";
      const attempt = { ...answer, sessionId: session.id, competency: inferCompetency(answer.question, answer.parentQuestionId, fallback) };
      if (answer.parentQuestionId && motivationAttempts.has(answer.parentQuestionId)) {
        motivationAttempts.get(answer.parentQuestionId)!.push(attempt);
        continue;
      }
      const story = identifyStory(`${answer.question}\n${answer.repairedTranscript || answer.transcript}`, storyBank);
      if (story) stories.get(story.id)!.attempts.push(attempt); else unmatched.push(attempt);
    }
  }
  const result = [...stories.values()].map((story) => {
    const sorted = story.attempts.filter((attempt) => {
      const questionId = attempt.parentQuestionId || `saved-${Buffer.from(attempt.question).toString("base64url").slice(0, 24)}`;
      const selected = bestSelections[questionId];
      return selected?.sessionId === attempt.sessionId && selected.createdAt === attempt.createdAt;
    }).sort((a, b) => (b.feedback?.score || 0) - (a.feedback?.score || 0));
    const competencyLinks = [...new Set(story.attempts.map((attempt) => attempt.competency))]
      .filter((competency) => !story.excludedCompetencies?.includes(competency))
      .map((competency) => {
      const attempts = story.attempts.filter((attempt) => attempt.competency === competency).sort((a, b) => {
        const aId = a.parentQuestionId || `saved-${Buffer.from(a.question).toString("base64url").slice(0, 24)}`;
        const bId = b.parentQuestionId || `saved-${Buffer.from(b.question).toString("base64url").slice(0, 24)}`;
        const aSelected = bestSelections[aId]?.sessionId === a.sessionId && bestSelections[aId]?.createdAt === a.createdAt ? 1 : 0;
        const bSelected = bestSelections[bId]?.sessionId === b.sessionId && bestSelections[bId]?.createdAt === b.createdAt ? 1 : 0;
        return bSelected - aSelected || (b.feedback?.score || 0) - (a.feedback?.score || 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
      const attempt = attempts[0];
      return {
        competency,
        question: attempt.question,
        questionId: attempt.parentQuestionId || `saved-${Buffer.from(attempt.question).toString("base64url").slice(0, 24)}`,
        answer: attempt.polishedAnswer || attempt.repairedTranscript || attempt.transcript,
        score: attempt.feedback?.score || null,
      };
      });
    return { id: story.id, title: story.title, organization: story.organization, summary: story.summary, facts: story.facts, attemptCount: story.attempts.length, competencies: competencyLinks.map((item) => item.competency), competencyLinks, questions: [...new Set(story.attempts.map((attempt) => attempt.question))], bestAttempt: sorted[0] || null };
  });
  const motivations = MOTIVATION_QUESTIONS.map(({ id, label }) => {
    const attempts = motivationAttempts.get(id) || [];
    const selected = bestSelections[id];
    const ranked = [...attempts].sort((a, b) => {
      const aSelected = selected?.sessionId === a.sessionId && selected.createdAt === a.createdAt ? 1 : 0;
      const bSelected = selected?.sessionId === b.sessionId && selected.createdAt === b.createdAt ? 1 : 0;
      return bSelected - aSelected || (b.feedback?.score || 0) - (a.feedback?.score || 0) || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    const attempt = ranked[0];
    return {
      id,
      label,
      competency: attempt?.competency || "motivation and role fit",
      question: attempt?.question || label,
      questionId: id,
      answer: attempt ? attempt.polishedAnswer || attempt.repairedTranscript || attempt.transcript : undefined,
      score: attempt?.feedback?.score || null,
    };
  });
  return NextResponse.json({ stories: result, motivations, unmatchedCount: unmatched.length }, { headers: { "Cache-Control": "no-store" } });
}
