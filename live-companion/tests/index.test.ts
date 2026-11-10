import { afterEach, describe, expect, it } from "vitest";
import { getBestAnswerIndex } from "@/lib/retrieval";
import { answer, session, tempDataDir } from "./helpers";

let data: ReturnType<typeof tempDataDir>;
afterEach(() => data?.cleanup());

const conflict = { "msft-reported-6": { sessionId: "s1", createdAt: "2026-10-01T10:00:00.000Z" } };

describe("getBestAnswerIndex", () => {
  it("reuses the index while nothing changes", async () => {
    data = tempDataDir();
    data.writeSession(session("s1", [answer({ question: "Conflict?", createdAt: "2026-10-01T10:00:00.000Z", transcript: "We disagreed." })]));
    data.writeSelections(conflict);
    const first = await getBestAnswerIndex(data.dir);
    expect(await getBestAnswerIndex(data.dir)).toBe(first);
  });

  it("rebuilds when a Best Answer is added, edited, or unselected", async () => {
    data = tempDataDir();
    data.writeSession(session("s1", [answer({ question: "Conflict?", createdAt: "2026-10-01T10:00:00.000Z", transcript: "We disagreed." })]));
    data.writeSession(session("s2", [answer({ question: "Failure?", createdAt: "2026-10-02T10:00:00.000Z", transcript: "It failed." })]));
    data.writeSelections(conflict);
    expect((await getBestAnswerIndex(data.dir)).answers.map((item) => item.questionId)).toEqual(["msft-reported-6"]);

    data.writeSelections({ ...conflict, "competency-3": { sessionId: "s2", createdAt: "2026-10-02T10:00:00.000Z" } });
    expect((await getBestAnswerIndex(data.dir)).answers).toHaveLength(2);

    data.writeSession(session("s2", [answer({ question: "Failure?", createdAt: "2026-10-02T10:00:00.000Z", transcript: "It failed.", polishedAnswer: "Polished failure story." })]));
    const edited = await getBestAnswerIndex(data.dir);
    expect(edited.answers.find((item) => item.questionId === "competency-3")?.answerText).toBe("Polished failure story.");
    expect(edited.retriever.search({ query: "polished failure story" }).results[0].questionId).toBe("competency-3");

    data.writeSelections(conflict);
    expect((await getBestAnswerIndex(data.dir)).answers.map((item) => item.questionId)).toEqual(["msft-reported-6"]);
  });
});
