# Steady

A privacy-minded AI mock-interview workspace for behavioral interviews and interactive product cases. It combines voice practice, answer review, a structured question bank, reusable story mapping, product-case coaching, and optional on-device delivery signals.

## Highlights

- **Behavioral practice:** record one answer or run a full mock interview with adaptive follow-ups.
- **Product-case interviewer:** practice design, root-cause, metrics, strategy, launch, prioritization, estimation, technical, and model-evaluation cases without replacing the original case halfway through.
- **Question Bank:** keep multiple attempts, explicitly choose a Best Answer, favorite questions, and request fact-preserving AI review.
- **Question Map:** see how 77 canonical behavioral questions roll up into reusable mother-question themes and how each variant changes the emphasis.
- **Story Bank:** connect one experience to multiple competencies instead of memorizing a separate story for every question.
- **Delivery coaching:** review ASR transcripts, recording playback, WPM, and optional on-device gaze patterns.
- **Private local storage:** recordings, transcripts, resumes, and personal story definitions remain outside Git by default.

The Product Case track keeps one main case prompt fixed for the entire interview. Clarification answers, restrained interviewer acknowledgements, and follow-up probes are conversation turns around that prompt—not replacement case questions.

With Continuous Voice Conversation enabled, the browser reads the case aloud, listens for the candidate's answer, submits after a short pause, speaks the interviewer's next turn, and resumes listening. This is hands-free turn-taking built on browser speech APIs; it is not simultaneous full-duplex audio or barge-in.

## Product case mode

Product case practice supports product design, root-cause analysis, product success, product strategy, product launch, prioritization and metric trade-offs, estimation, technical product sense, and model/product evaluation. A local retrieval layer selects relevant guidance for the current case and answer; the interviewer then asks one adaptive follow-up.

- `POST /api/knowledge` exposes the knowledge base separately from the interview session API.
- Typed working notes are included in feedback and the final report.
- Optional screen sharing samples a low-resolution frame about every 12 seconds while an answer is active and captures a final frame on submission. The model can use it to understand visible notes, but raw images are not written to session storage.
- Coaching can remain silent until the report, appear after each answer, or show a lightweight live structure plus checkpoint feedback.
- Real Interviewer mode responds to clarifying questions and requests for confirmation with restrained, neutral guidance; it does not expose the framework or score until the final report.
- Both total case time and current-answer time are tracked.

## Live Mock Companion

[`live-companion/`](live-companion/) is a separate Next.js app for **consented** live mock interviews (e.g. Teams on the web). It transcribes the interviewer through the OpenAI Realtime API, detects questions, and retrieves your top 3 Best Answers from Steady's `data/` directory, which it only reads. It ships with Vitest tests and an offline retrieval eval (Recall@3, latency, held-out set). See its [README](live-companion/README.md).

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`. Camera and microphone access work on localhost in modern browsers. Chrome provides the best speech-recognition support.

Your first practice session creates local `data/` and `uploads/` content. Those directories are ignored by Git. To customize the Story Bank, create `data/profile/stories.json` using the schema in `lib/story-bank.ts`; the repository falls back to anonymous examples when a private profile is absent.

An OpenAI key is optional. Without one, Steady uses built-in questions, retrieval, and deterministic coaching. With `OPENAI_API_KEY` configured, questions and case feedback adapt to the resume, job description, answer history, retrieved knowledge, notes, and—when explicitly shared—the current screen frame.

The current model provider is the OpenAI Responses API. `OPENAI_MODEL` controls text interviewing and feedback; `OPENAI_VISION_MODEL` controls screen-note understanding. Both default to `gpt-4.1-mini` when an API key is present.

## Privacy model

- Face landmarks and gaze direction are computed in the browser with MediaPipe.
- The server receives aggregate gaze metrics, not facial landmarks.
- Audio/video is recorded only when the setup toggle is enabled.
- Saved recordings live in `uploads/`; session JSON lives in `data/`.
- Playback is collapsed by default and never starts automatically.
- `.env*.local`, `data/`, and `uploads/` are excluded from version control. Do not remove those ignore rules in a public fork.

## Gaze interpretation

Steady first samples the candidate's neutral gaze to create a per-session baseline. During each answer it groups directional samples into meaningful look-away episodes and evaluates dwell duration, repeated direction, horizontal switching, and return-to-center behavior. The report distinguishes steady gaze, natural recall, sustained look-away, possible reading patterns, and insufficient evidence. Every classification includes confidence and the underlying measurements.

These labels are coaching signals, not claims about intent, deception, or cheating. A VLM is intentionally not required: landmarks plus temporal features are faster, more private, and easier to explain. Speech/gaze fusion and voluntary VLM analysis can be added later as separate, consent-based layers.
