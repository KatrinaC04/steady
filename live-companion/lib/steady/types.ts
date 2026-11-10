// Vendored from Steady (lib/types.ts) by `npm run sync:steady`. Do not edit by hand.
export type PromptMode = "none" | "bullets" | "full";
export type InterviewLanguage = "English" | "中文" | "Bilingual";
export type InterviewTrack = "behavioral" | "product_case";
export type ProductCaseType = "mixed" | "product_design" | "root_cause" | "product_success" | "product_strategy" | "product_launch" | "prioritization" | "estimation" | "technical" | "model_evaluation";
export type CoachingMode = "interviewer" | "silent" | "checkpoints" | "live";

export type InterviewConfig = {
  role: string;
  company: string;
  resume: string;
  jobDescription: string;
  language: InterviewLanguage;
  promptMode: PromptMode;
  duration: number;
  saveRecording: boolean;
  showGazeDot: boolean;
  track: InterviewTrack;
  caseType: ProductCaseType;
  coachingMode: CoachingMode;
  shareScreen: boolean;
  voiceConversation: boolean;
  startingQuestionId?: string;
  startingQuestionText?: string;
};

export type QuestionMeta = {
  text: string;
  parentId: string;
  parentPrompt: string;
  category: string;
  source: "candidate-reported" | "structured-bank" | "ai-variant";
};

export type CaseFeedback = {
  stage: string;
  score: number;
  strength: string;
  correction: string;
  nextFocus: string;
  screenSummary?: string;
  scoreRationale?: string;
  suggestedAnswer?: string;
  missingDetails?: string[];
};

export type AnswerMetrics = {
  words: number;
  durationSeconds: number;
  wpm: number;
  gazeScore: number;
  gazeAwaySeconds: number;
  gazePattern?: "steady" | "natural_recall" | "sustained_away" | "possible_reading" | "insufficient_data";
  gazeConfidence?: number;
  longestGazeAwaySeconds?: number;
  gazeAwayEpisodes?: number;
  horizontalGazeSwitches?: number;
  transcript: string;
};

export type InterviewAnswer = AnswerMetrics & {
  question: string;
  createdAt: string;
  entrySource?: "recorded" | "manual";
  repairedTranscript?: string;
  polishedAnswer?: string;
  polishReview?: {
    status: "ready" | "needs-details";
    missingDetails: string[];
    reviewedAt: string;
  };
  notes?: string;
  feedback?: CaseFeedback;
  parentQuestionId?: string;
};

export type Session = {
  id: string;
  config: InterviewConfig;
  questions: string[];
  questionMeta?: QuestionMeta[];
  casePrompt?: string;
  casePromptOrigin?: "candidate-reported" | "ai-variant-grounded-in-reported-prompts";
  answers: InterviewAnswer[];
  createdAt: string;
  completedAt?: string;
  recordingPath?: string;
  finalFeedback?: string;
};
