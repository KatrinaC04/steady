import { afterEach, describe, expect, it } from "vitest";
import { getResolvedBestAnswers, pickAnswerText } from "@/lib/best-answers";
import { answer, session, tempDataDir } from "./helpers";

let data: ReturnType<typeof tempDataDir>;
afterEach(() => data?.cleanup());

describe("getResolvedBestAnswers", () => {
  it("resolves a selection and enriches it from the Question Bank and Question Map", async () => {
    data = tempDataDir();
    data.writeSession(session("s1", [answer({ question: "Tell me about a conflict on your team.", createdAt: "2026-10-01T10:00:00.000Z", transcript: "raw", polishedAnswer: "At Acme we disagreed about routing." })]));
    data.writeSelections({ "msft-reported-6": { sessionId: "s1", createdAt: "2026-10-01T10:00:00.000Z" } });

    const { answers, warnings } = await getResolvedBestAnswers(data.dir);
    expect(warnings).toEqual([]);
    expect(answers).toHaveLength(1);
    expect(answers[0]).toMatchObject({
      questionId: "msft-reported-6",
      canonicalQuestion: "Describe a conflict you managed and what you personally did.",
      attemptedQuestion: "Tell me about a conflict on your team.",
      category: "Microsoft reported",
      source: "candidate-reported",
      motherId: "conflict",
      twist: "Alignment under tension",
      answerText: "At Acme we disagreed about routing.",
      answerTextSource: "polishedAnswer",
      sessionId: "s1",
      answerCreatedAt: "2026-10-01T10:00:00.000Z",
    });
  });

  it("uses only the selected attempt, not other attempts in the same session", async () => {
    data = tempDataDir();
    data.writeSession(session("s1", [
      answer({ question: "Q", createdAt: "2026-10-01T10:00:00.000Z", transcript: "first attempt" }),
      answer({ question: "Q", createdAt: "2026-10-01T11:00:00.000Z", transcript: "chosen attempt" }),
    ]));
    data.writeSelections({ "competency-3": { sessionId: "s1", createdAt: "2026-10-01T11:00:00.000Z" } });
    const { answers } = await getResolvedBestAnswers(data.dir);
    expect(answers.map((item) => item.answerText)).toEqual(["chosen attempt"]);
  });

  it("skips dangling references with diagnosable warnings", async () => {
    data = tempDataDir();
    data.writeSession(session("s1", [
      answer({ question: "Q", createdAt: "2026-10-01T10:00:00.000Z", transcript: "   " }),
      answer({ question: "Q", createdAt: "2026-10-01T11:00:00.000Z", transcript: "kept" }),
    ]));
    data.writeSelections({
      "competency-1": { sessionId: "missing-session", createdAt: "2026-10-01T10:00:00.000Z" },
      "competency-2": { sessionId: "s1", createdAt: "2026-10-01T09:59:59.000Z" },
      "competency-3": { sessionId: "s1", createdAt: "2026-10-01T10:00:00.000Z" },
      "competency-4": { sessionId: "s1" },
      "competency-5": { sessionId: "s1", createdAt: "2026-10-01T11:00:00.000Z" },
    });
    const { answers, warnings } = await getResolvedBestAnswers(data.dir);
    expect(answers.map((item) => item.questionId)).toEqual(["competency-5"]);
    expect(warnings).toEqual([
      { questionId: "competency-1", code: "session-missing", sessionId: "missing-session" },
      { questionId: "competency-2", code: "answer-missing", sessionId: "s1", createdAt: "2026-10-01T09:59:59.000Z" },
      { questionId: "competency-3", code: "empty-answer", sessionId: "s1", createdAt: "2026-10-01T10:00:00.000Z" },
      { questionId: "competency-4", code: "invalid-selection" },
    ]);
  });

  it("treats a saved AI variation as its own canonical question", async () => {
    data = tempDataDir();
    data.writeSession(session("s1", [answer({ question: "Can you describe a time you aligned multiple stakeholders?", createdAt: "2026-10-01T10:00:00.000Z", transcript: "At Acme..." })]));
    data.writeSelections({ "saved-abc": { sessionId: "s1", createdAt: "2026-10-01T10:00:00.000Z" } });
    const [resolved] = (await getResolvedBestAnswers(data.dir)).answers;
    expect(resolved).toMatchObject({ canonicalQuestion: "Can you describe a time you aligned multiple stakeholders?", category: "Saved AI variation", source: "saved-variation", motherId: "conflict" });
  });

  it("returns nothing for a missing preferences file and warns for a corrupt one", async () => {
    data = tempDataDir();
    expect(await getResolvedBestAnswers(data.dir)).toEqual({ answers: [], warnings: [] });
    data.writeSelections("{not json");
    expect(await getResolvedBestAnswers(data.dir)).toEqual({ answers: [], warnings: [{ questionId: "*", code: "selections-unreadable" }] });
  });

  it("does not read session files outside the data directory", async () => {
    data = tempDataDir();
    data.writeSelections({ "competency-1": { sessionId: "../../etc/passwd", createdAt: "x" } });
    const { warnings } = await getResolvedBestAnswers(data.dir);
    expect(warnings[0]).toMatchObject({ code: "session-missing" });
  });
});

describe("pickAnswerText", () => {
  it("prefers polishedAnswer, then repairedTranscript, then transcript", () => {
    expect(pickAnswerText({ polishedAnswer: "p", repairedTranscript: "r", transcript: "t" })).toEqual({ text: "p", source: "polishedAnswer" });
    expect(pickAnswerText({ polishedAnswer: " ", repairedTranscript: "r", transcript: "t" })).toEqual({ text: "r", source: "repairedTranscript" });
    expect(pickAnswerText({ repairedTranscript: "", transcript: " t " })).toEqual({ text: "t", source: "transcript" });
    expect(pickAnswerText({ transcript: "" })).toBeNull();
  });
});
