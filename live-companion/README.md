# Steady Live Companion

Live Best Answer retrieval for **consented** Teams mock interviews. Spec: [docs/teams-mock-copilot-prd.md](docs/teams-mock-copilot-prd.md).

This lives in `live-companion/` inside the Steady repo. Steady remains the source of truth: this project **only reads** its `data/` directory (sessions plus `preferences/best-answers.json`) and never writes to it.

## Run

```bash
npm install
cp .env.example .env.local   # STEADY_DATA_DIR defaults to ../data
npm run dev                  # http://localhost:3100 (Steady keeps :3000)
```

Live transcription needs `OPENAI_API_KEY` in `.env.local`. `npm run check:realtime` verifies that OpenAI accepts the session config.

### Using the Live Mock Companion (`/live-companion`)

1. Join the mock in **Teams on the web** in Chrome or Edge, wearing headphones.
2. In the companion, choose **Teams web tab**, then **Start sharing audio**, pick the Teams tab, and turn on **Also share tab audio**. The meter should move when the interviewer talks.
3. Confirm everyone knows you're using a transcription aid, then **Start Mock Companion**.
4. Questions are detected automatically. Use **Search now** to cut in early, **Not a question** to discard a false trigger, or type a question if audio fails.
5. **Stop** shows a review (questions, matches, timings). Nothing is saved unless you download it.

Only the interviewer is captured: a shared tab carries the remote audio, not your microphone.

| Command | What it does |
| --- | --- |
| `npm test` | Unit and API tests (temp fixture data, never your real data) |
| `npm run eval` | Recall@3 / theme recall / latency on `eval/prompts.json` against real Best Answers |
| `npm run eval -- --holdout` | Same on `eval/holdout.json`, which is never used for tuning |
| `npm run search -- "<question>"` | Ad-hoc Top 3 with score breakdown |
| `npm run sync:steady` | Re-vendor Steady's question bank, Question Map and types into `lib/steady/` |

## Layout

- `lib/best-answers.ts`: FR-1. `getResolvedBestAnswers()` resolves selections into `ResolvedBestAnswer[]` (text priority `polishedAnswer > repairedTranscript > transcript`) and reports id-only warnings for dangling references.
- `lib/retrieval/`: FR-2. `BestAnswerRetriever` interface; `lexical-v1` baseline (TF-IDF + intent concepts + mother theme + entity overlap, using the PRD weights); fingerprinted cache that rebuilds when a selection or a referenced session file changes.
- `app/api/best-answers/{index,search,[questionId]}`: the API from PRD §7. Search returns previews only; full text is fetched one answer at a time.
- `app/page.tsx`: Phase 1 search test page.
- `lib/live/`: Phase 2 pure logic. `capture.ts` (getDisplayMedia, audio-track check, error help), `question-end.ts` (does the text read like a finished question?), `companion-reducer.ts` (captions → committed questions: VAD stop + final transcript + silence windows, continuation merge, chatter filtering), `realtime-session.ts` (transcription-only server-VAD session), `metrics.ts` (latency and review export).
- `hooks/`: `useRealtimeTranscription` (WebRTC for any audio stream, auto-reconnect), `useCompanionSearch` (one formal search per question, aborts stale ones, keeps prefetch separate), `useAudioLevel`.
- `app/live-companion/`: Setup → Live → Review UI. `app/api/realtime/token`: mints the short-lived client secret.

## Status

- [x] Phase 1: retrieval core
- [x] Phase 2: `/live-companion` Web MVP (built and unit/integration tested; manual Teams acceptance pending)
- [ ] Phase 3: constrained compose API (Quick Outline / Full Answer)
- [ ] Phase 4: tuning, embeddings if needed, desktop audio
