import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getAnswer } from "@/app/api/best-answers/[questionId]/route";
import { GET as getIndex } from "@/app/api/best-answers/index/route";
import { POST as search } from "@/app/api/best-answers/search/route";
import { answer, session, tempDataDir } from "./helpers";

let data: ReturnType<typeof tempDataDir>;
const previous = process.env.STEADY_DATA_DIR;

beforeAll(() => {
  data = tempDataDir();
  data.writeSession(session("s1", [answer({ question: "Describe a conflict.", createdAt: "2026-10-01T10:00:00.000Z", polishedAnswer: "At Acme, engineering and operations disagreed about escalation rules." })]));
  data.writeSelections({ "msft-reported-6": { sessionId: "s1", createdAt: "2026-10-01T10:00:00.000Z" }, "competency-1": { sessionId: "gone", createdAt: "x" } });
  process.env.STEADY_DATA_DIR = data.dir;
});
afterAll(() => { process.env.STEADY_DATA_DIR = previous; data.cleanup(); });

const post = (body: unknown) => search(new Request("http://test/api/best-answers/search", { method: "POST", body: JSON.stringify(body) }));

describe("best-answers API", () => {
  it("summarizes the index without answer bodies", async () => {
    const body = await (await getIndex(new Request("http://test/api/best-answers/index?include=entries"))).json();
    expect(body).toMatchObject({ count: 1, retriever: "lexical-v1", warnings: [{ questionId: "competency-1", code: "session-missing" }] });
    expect(body.entries[0]).not.toHaveProperty("answerText");
    expect(JSON.stringify(body)).not.toContain("escalation rules");
  });

  it("searches and returns ranked previews", async () => {
    const response = await post({ query: "Tell me about a time you disagreed with a stakeholder", language: "English", limit: 3, conversationContext: [] });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results[0]).toMatchObject({ questionId: "msft-reported-6", motherId: "conflict" });
    expect(body).toMatchObject({ confident: true, indexSize: 1 });
  });

  it.each([
    [{}, "query is required."],
    [{ query: "  " }, "query is required."],
    [{ query: "x", limit: 0 }, "limit must be an integer from 1 to 10."],
    [{ query: "x", conversationContext: "nope" }, "conversationContext must be an array of strings."],
  ])("rejects invalid input %j", async (body, error) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(error);
  });

  it("serves one full Best Answer on demand", async () => {
    const ok = await getAnswer(new Request("http://test"), { params: Promise.resolve({ questionId: "msft-reported-6" }) });
    expect((await ok.json()).answerText).toContain("escalation rules");
    const missing = await getAnswer(new Request("http://test"), { params: Promise.resolve({ questionId: "nope" }) });
    expect(missing.status).toBe(404);
  });
});
