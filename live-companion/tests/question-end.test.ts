import { describe, expect, it } from "vitest";
import { assessQuestionEnd } from "@/lib/live/question-end";

describe("assessQuestionEnd", () => {
  it.each([
    ["Tell me about a time you disagreed with a stakeholder.", "question"],
    ["What makes a product good?", "question"],
    ["Why Microsoft?", "question"],
    ["Walk me through your resume", "question"],
    ["讲一个你失败的经历", "question"],
    ["你为什么想来微软？", "question"],
    ["Tell me about a conflict and", "incomplete"],
    ["Describe a project you led, also", "incomplete"],
    ["Oh, and one more thing...", "incomplete"],
    ["说说你的领导经历，还有", "incomplete"],
    ["Okay, great, thanks.", "not-question"],
    ["Mm-hmm.", "not-question"],
    ["好的，谢谢", "not-question"],
    ["Let's move on.", "not-question"],
    ["Sure", "not-question"],
    ["", "not-question"],
  ])("%j → %s", (text, kind) => {
    expect(assessQuestionEnd(text).kind).toBe(kind);
  });

  it("is less sure about plain statements than explicit questions", () => {
    const statement = assessQuestionEnd("Next I want to understand your leadership experience");
    const question = assessQuestionEnd("Can you tell me about your leadership experience?");
    expect(statement.kind).toBe("question");
    expect(question.confidence).toBeGreaterThan(statement.confidence);
  });
});
