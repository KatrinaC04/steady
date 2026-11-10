// FR-5 text signal: does the interviewer's utterance read like a finished question or instruction?
// Timing (VAD silence, final transcript) is handled by the companion reducer; this only judges the words.

export type QuestionEndKind = "question" | "incomplete" | "not-question";
export type QuestionEndAssessment = { kind: QuestionEndKind; confidence: number; reasons: string[] };

export const MIN_WORDS = 3;
// At or above this confidence the reducer commits as soon as the transcript is final.
export const COMMIT_CONFIDENCE = 0.6;

const ACKNOWLEDGEMENT = /^((ok(ay)?|great|good|thanks?|thank you|sounds good|perfect|cool|nice|got it|i see|right|sure|awesome|interesting|yeah|yes|so|and|mm+[- ]?hmm+|uh[- ]huh|nice to meet you|好的?|嗯+|谢谢|明白了?|不错|可以)[\s,.!。！，]*)+$/i;
const FILLER_CLOSE = /\b(let'?s (move on|get started|start|begin)|moving on|that'?s (all|it) (from me|for now))[\s.!]*$/i;
const TRAILING_INCOMPLETE = /(\b(and|also|or|but|so|because|like|um+|uh+|the|a|an|to|of|with|then|for|about|your|you)|one more thing|[,，、:：]|\.\.\.|…|(还有|然后|就是|并且|而且|以及|比如|那个|另外))[\s.,，。…-]*$/i;
const QUESTION_OPENER = /^(so,?\s*|and,?\s*|okay,?\s*|great,?\s*|now,?\s*)*(what|why|how|when|where|which|who|tell me|walk me|describe|give me|can you|could you|would you|have you|did you|do you|are you|were you|imagine|suppose|explain|talk (me )?(through|about)|share|pick|choose|let'?s talk about|i'?d (like|love) to hear)\b/i;
const QUESTION_CUE = /\b(tell me about|walk me through|give me an example|can you|could you|how would you|what would you|how did you|what did you|why did you|why do you)\b|[?？]|(讲一?个|说说|说一下|讲讲|介绍一下|为什么|怎么|如何|什么|吗|呢|是否)/i;

export function wordCount(text: string) {
  const latin = text.match(/[A-Za-z0-9][A-Za-z0-9'.+#-]*/g)?.length || 0;
  const cjk = text.match(/[一-鿿]/g)?.length || 0;
  return latin + Math.ceil(cjk / 2);
}

export function assessQuestionEnd(raw: string): QuestionEndAssessment {
  const text = raw.trim();
  const words = wordCount(text);
  const asks = QUESTION_CUE.test(text) || QUESTION_OPENER.test(text);
  if (!text) return { kind: "not-question", confidence: 0, reasons: ["empty"] };
  if (ACKNOWLEDGEMENT.test(text) || FILLER_CLOSE.test(text)) return { kind: "not-question", confidence: 0.05, reasons: ["acknowledgement"] };
  // "Why Microsoft?" is two words but clearly a question.
  if (words < MIN_WORDS && !(words >= 2 && asks)) return { kind: "not-question", confidence: 0.1, reasons: ["too-short"] };
  if (TRAILING_INCOMPLETE.test(text)) return { kind: "incomplete", confidence: 0.3, reasons: ["trailing-connector"] };
  if (/[?？]\s*$/.test(text)) return { kind: "question", confidence: 0.95, reasons: ["question-mark"] };
  if (asks) return { kind: "question", confidence: 0.85, reasons: ["question-cue"] };
  // A plain statement may still be a prompt ("I'd like to hear about leadership."), but wait a little longer for it.
  return { kind: "question", confidence: 0.5, reasons: ["declarative"] };
}
