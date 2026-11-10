"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Bookmark, FilePlus2, Map, Mic, RefreshCw, Search, Sparkles, Star, Trash2, X } from "lucide-react";

type SavedAttempt = {
  sessionId: string;
  createdAt: string;
  transcript: string;
  repairedTranscript?: string;
  polishedAnswer?: string;
  polishReview?: { status: "ready" | "needs-details"; missingDetails: string[]; reviewedAt: string };
  entrySource?: "recorded" | "manual";
  feedback?: { score: number; strength: string; correction: string };
  wpm: number;
};

type LibraryQuestion = {
  id: string;
  primaryCategory: "Behavioral" | "Why company" | "Resume deep dive" | "Case questions";
  secondaryCategory: string;
  category: string;
  prompt: string;
  source: string;
  attemptCount: number;
  bestAttempt: SavedAttempt | null;
  attempts: SavedAttempt[];
  caseType?: string;
};

export default function QuestionLibrary() {
  const [questions, setQuestions] = useState<LibraryQuestion[]>([]);
  const [query, setQuery] = useState("");
  const [primaryFilter, setPrimaryFilter] = useState("all");
  const [secondaryFilter, setSecondaryFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const loadQuestions = useCallback(async () => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    setError("");
    try {
      const response = await fetch("/api/library?summary=1", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`Question Library request failed (${response.status})`);
      const data = await response.json();
      setQuestions([...(data.questions || []), ...(data.savedVariations || []), ...(data.caseQuestions || [])]);
      void fetch("/api/library", { cache: "no-store" })
        .then((fullResponse) => fullResponse.ok ? fullResponse.json() : null)
        .then((fullData) => {
          if (fullData) setQuestions([...(fullData.questions || []), ...(fullData.savedVariations || []), ...(fullData.caseQuestions || [])]);
        })
        .catch(() => {});
    } catch (reason) {
      const failure = reason as { name?: string; message?: string };
      setError(failure.name === "AbortError" ? "The Question Library took too long to load." : failure.message || "Could not load the Question Library.");
    } finally {
      window.clearTimeout(timeout);
    }
  }, []);

  useEffect(() => {
    loadQuestions().finally(() => setLoading(false));
  }, [loadQuestions]);

  useEffect(() => {
    try {
      setFavorites(new Set(JSON.parse(localStorage.getItem("steady-question-favorites") || "[]")));
    } catch {}
  }, []);

  const primaryCategories = ["all", "Behavioral", "Why company", "Resume deep dive", "Case questions"];
  const secondaryCategories = useMemo(() => ["all", ...Array.from(new Set(questions.filter((item) => primaryFilter === "all" || item.primaryCategory === primaryFilter).map((item) => item.secondaryCategory)))], [questions, primaryFilter]);
  const visible = useMemo(
    () => questions.filter((item) =>
      (!favoritesOnly || favorites.has(item.id))
      && (primaryFilter === "all" || item.primaryCategory === primaryFilter)
      && (secondaryFilter === "all" || item.secondaryCategory === secondaryFilter)
      && `${item.prompt} ${item.primaryCategory} ${item.secondaryCategory} ${item.category}`.toLowerCase().includes(query.toLowerCase())),
    [questions, query, primaryFilter, secondaryFilter, favorites, favoritesOnly],
  );

  const toggleFavorite = (id: string) => setFavorites((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    localStorage.setItem("steady-question-favorites", JSON.stringify([...next]));
    return next;
  });

  const openComposer = (id: string) => {
    setAddingId(id);
    setDraft("");
    setNotice("");
  };

  const saveAlternative = async (item: LibraryQuestion) => {
    if (!draft.trim()) return;
    setSaving(true);
    const response = await fetch("/api/library/answers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId: item.id, question: item.prompt, transcript: draft.trim() }),
    });
    setSaving(false);
    if (!response.ok) {
      setNotice("Could not save that answer. Please try again.");
      return;
    }
    await loadQuestions();
    setAddingId(null);
    setDraft("");
    setNotice("Written alternative saved. Your scored Best Answer was not replaced.");
  };

  const selectBestAttempt = async (questionId: string, attempt: SavedAttempt) => {
    const response = await fetch("/api/library/answers", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, sessionId: attempt.sessionId, createdAt: attempt.createdAt }),
    });
    if (!response.ok) { setNotice("Could not update your Best Answer. Please try again."); return; }
    await loadQuestions();
    setNotice("Best Answer updated. Your previous version remains in the answer history.");
  };

  const deleteAttempt = async (questionId: string, attempt: SavedAttempt) => {
    if (!window.confirm("Delete this saved answer? This cannot be undone.")) return;
    const response = await fetch("/api/library/answers", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questionId, sessionId: attempt.sessionId, createdAt: attempt.createdAt }),
    });
    if (!response.ok) {
      setNotice("Could not delete that answer. Please try again.");
      return;
    }
    await loadQuestions();
    setNotice("Answer deleted. If it was your Best Answer, no replacement was selected automatically.");
  };

  const reviewBestWithAI = async (item: LibraryQuestion) => {
    if (!item.bestAttempt) return;
    setReviewingId(item.id);
    const response = await fetch("/api/library/improve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId: item.bestAttempt.sessionId, createdAt: item.bestAttempt.createdAt }) });
    setReviewingId(null);
    if (!response.ok) { setNotice("AI review could not be completed. Please try again."); return; }
    await loadQuestions();
    setNotice("AI review complete. Missing evidence is flagged instead of being invented.");
  };

  return (
    <main className="libraryPage">
      <nav>
        <a href="/"><ArrowLeft size={17} /> Interview room</a>
        <div className="brand"><span className="brandMark">S</span> Steady</div>
        <a href="/map"><Map size={16}/> Question map</a>
      </nav>

      <header>
        <span>INTERVIEW QUESTION LIBRARY</span>
        <h1>One library.<br />A clearer interview map.</h1>
        <p>Browse behavioral, motivation, resume deep-dive, and case questions without scattering preparation across separate banks.</p>
      </header>

      {notice && (
        <div className="libraryNotice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="Dismiss notification"><X size={16} /></button>
        </div>
      )}

      <section className="libraryTools">
        <label><Search size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search questions, competencies, or products…" /></label>
        <select value={primaryFilter} onChange={(event) => { setPrimaryFilter(event.target.value); setSecondaryFilter("all"); }} aria-label="Filter by primary category">
          {primaryCategories.map((category) => <option key={category} value={category}>{category === "all" ? "All question types" : category}</option>)}
        </select>
        <select value={secondaryFilter} onChange={(event) => setSecondaryFilter(event.target.value)} aria-label="Filter by secondary category">
          {secondaryCategories.map((category) => <option key={category} value={category}>{category === "all" ? "All subcategories" : category}</option>)}
        </select>
        <button className={`favoritesFilter ${favoritesOnly ? "active" : ""}`} aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly((value) => !value)}>
          <Bookmark size={16} fill={favoritesOnly ? "currentColor" : "none"} />
          {favoritesOnly ? "Favorites only" : `Favorites (${favorites.size})`}
        </button>
      </section>

      {loading ? <p className="libraryEmpty">Loading your question bank…</p> : error ? <section className="storyLoadError"><b>Question Library couldn’t load.</b><p>{error}</p><button onClick={() => { setLoading(true); loadQuestions().finally(() => setLoading(false)); }}><RefreshCw size={15}/> Try again</button></section> : (
        <section className="questionLibraryGrid">
          {visible.map((item) => {
            const favorite = favorites.has(item.id);
            const best = item.bestAttempt;
            return (
              <article id={`question-${item.id}`} className={`questionCard ${favorite ? "favorite" : ""}`} key={item.id}>
                <div className="questionCardMeta">
                  <span>{item.primaryCategory} · {item.secondaryCategory}</span>
                  <div className="questionCardMetaActions">
                    <small>{item.source === "candidate-reported" ? "REPORTED ANCHOR" : item.source === "practice-scenario" ? "PRACTICE SCENARIO" : item.source === "saved-variation" ? "SAVED VARIATION" : "STRUCTURED BANK"}</small>
                    <button className="favoriteButton" onClick={() => toggleFavorite(item.id)} aria-label={favorite ? "Remove from favorites" : "Add to favorites"} aria-pressed={favorite} title={favorite ? "Remove from favorites" : "Add to favorites"}>
                      <Bookmark size={17} fill={favorite ? "currentColor" : "none"} />
                    </button>
                  </div>
                </div>

                <h2>{item.prompt}</h2>
                <div className="attemptSummary">
                  {best ? (
                    <>
                      <span><Star size={15} fill="currentColor" /> Best {best.feedback?.score || "—"}/5</span>
                      <small>{item.attemptCount} saved answer{item.attemptCount === 1 ? "" : "s"} · {best.wpm} wpm</small>
                    </>
                  ) : item.attemptCount ? <small>{item.attemptCount} saved answer{item.attemptCount === 1 ? "" : "s"} · no Best selected</small> : <small>No answers yet</small>}
                </div>

                {best && (
                  <details>
                    <summary>Best answer {best.polishedAnswer ? <i className={best.polishReview?.status === "ready" ? "ready" : "needsDetails"}>{best.polishReview?.status === "ready" ? "AI-reviewed" : "Needs details"}</i> : best.repairedTranscript && <i>ASR cleanup only</i>}</summary>
                    <p>{best.polishedAnswer || best.repairedTranscript || best.transcript}</p>
                    {best.polishReview?.status === "needs-details" && !!best.polishReview.missingDetails.length && <div className="answerGaps"><b>Evidence still needed</b><ul>{best.polishReview.missingDetails.map((detail)=><li key={detail}>{detail}</li>)}</ul></div>}
                    {best.repairedTranscript && best.repairedTranscript !== best.transcript && (
                      <details className="rawAsr"><summary>View original ASR transcript</summary><p>{best.transcript}</p></details>
                    )}
                    {best.feedback && <blockquote><b>What worked</b>{best.feedback.strength}<b>Next improvement</b>{best.feedback.correction}</blockquote>}
                    <button className="aiReviewAnswer" onClick={()=>reviewBestWithAI(item)} disabled={reviewingId===item.id}><Sparkles size={15}/>{reviewingId===item.id?"Reviewing answer…":best.polishedAnswer?"Review again with AI":"Review structure with AI"}</button>
                  </details>
                )}

                {!!item.attempts.length && (
                  <details className="answerArchive">
                    <summary>All saved answers <span>{item.attempts.length}</span></summary>
                    <div>
                      {item.attempts.map((attempt) => {
                        const isBest = best?.sessionId === attempt.sessionId && best?.createdAt === attempt.createdAt;
                        return (
                          <article key={`${attempt.sessionId}-${attempt.createdAt}`}>
                            <header>
                              <div>
                                <strong>{isBest ? "BEST" : attempt.entrySource === "manual" ? "WRITTEN ALTERNATIVE" : "RECORDED"}</strong>
                                <small>{new Date(attempt.createdAt).toLocaleDateString()} · {attempt.feedback ? `${attempt.feedback.score}/5` : "Unscored"}</small>
                              </div>
                              <div className="archiveActions">
                                {!isBest && <button onClick={() => selectBestAttempt(item.id, attempt)} aria-label="Set this as Best Answer" title="Set as Best Answer"><Star size={16} /></button>}
                                <button onClick={() => deleteAttempt(item.id, attempt)} aria-label="Delete this saved answer" title="Delete answer"><Trash2 size={16} /></button>
                              </div>
                            </header>
                            <p>{attempt.polishedAnswer || attempt.repairedTranscript || attempt.transcript}</p>
                          </article>
                        );
                      })}
                    </div>
                  </details>
                )}

                {item.primaryCategory === "Case questions" ? <div className="questionActions"><a className="practiceQuestion" href={`/?caseType=${encodeURIComponent(item.caseType || "mixed")}&casePrompt=${encodeURIComponent(item.prompt)}`}><Mic size={16}/> Practice this case</a></div> : addingId === item.id ? (
                  <div className="writtenAnswerComposer">
                    <label htmlFor={`answer-${item.id}`}>Add a written alternative</label>
                    <textarea id={`answer-${item.id}`} value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Paste or write another version. It will remain unscored and will not replace your Best Answer." autoFocus />
                    <div>
                      <button className="cancel" onClick={() => { setAddingId(null); setDraft(""); }} disabled={saving}>Cancel</button>
                      <button className="save" onClick={() => saveAlternative(item)} disabled={saving || !draft.trim()}>{saving ? "Saving…" : "Save alternative"}</button>
                    </div>
                  </div>
                ) : (
                  <div className="questionActions">
                    <a className="practiceQuestion" href={`/practice?questionId=${encodeURIComponent(item.id)}&questionText=${encodeURIComponent(item.prompt)}&category=${encodeURIComponent(item.category)}`}><Mic size={16} /> {item.attemptCount ? "Record another" : "Record an answer"}</a>
                    <button className="addWrittenAnswer" onClick={() => openComposer(item.id)}><FilePlus2 size={16} /> Add written answer</button>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {!loading && !error && !visible.length && <p className="libraryEmpty">{favoritesOnly && !favorites.size ? "You haven’t saved any favorite questions yet." : "No questions match the current filters."}</p>}
    </main>
  );
}
