"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Bookmark, ChevronDown, Map as MapIcon, Mic, RefreshCw, Search, Star, X } from "lucide-react";
import { inferMotherId, QUESTION_MOTHERS, questionTwist } from "@/lib/question-map";

type Attempt = { transcript: string; repairedTranscript?: string; polishedAnswer?: string; polishReview?: { status: "ready" | "needs-details"; missingDetails: string[] }; wpm: number; feedback?: { score: number; strength: string; correction: string } };
type Question = { id: string; category: string; prompt: string; source: string; attemptCount: number; bestAttempt: Attempt | null };

export default function QuestionMapPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true); setError("");
    fetch("/api/library?summary=1", { cache: "no-store", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(`Question Map request failed (${response.status})`); return response.json(); })
      .then((data) => setQuestions([...(data.questions || []), ...(data.savedVariations || [])]))
      .catch((reason) => setError(reason?.name === "AbortError" ? "The Question Map took too long to load." : reason?.message || "Could not load the Question Map."))
      .finally(() => { window.clearTimeout(timeout); setLoading(false); });
    try { setFavorites(new Set(JSON.parse(localStorage.getItem("steady-question-favorites") || "[]"))); } catch {}
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [loadKey]);

  const canonicalMotherById = useMemo(() => new Map(QUESTION_MOTHERS.flatMap((mother) => mother.questionIds.map((id) => [id, mother.id]))), []);
  const groups = useMemo(() => {
    const motherList = [...QUESTION_MOTHERS, { id: "unmapped", title: "Saved AI variants", corePrompt: "Which canonical question is this variation really testing?", description: "Historical questions without a stored parent ID are kept here until you connect them to a canonical mother question.", questionIds: [] }];
    return motherList.map((mother) => ({
      ...mother,
      questions: questions.filter((question) => {
        const motherId = canonicalMotherById.get(question.id) || inferMotherId(question.prompt);
        const matchesView = (!favoritesOnly || favorites.has(question.id)) && `${question.prompt} ${question.category} ${mother.title}`.toLowerCase().includes(query.toLowerCase());
        return motherId === mother.id && matchesView;
      }),
    })).filter((mother) => mother.questions.length > 0);
  }, [questions, canonicalMotherById, favoritesOnly, favorites, query]);
  const selected = questions.find((question) => question.id === selectedId) || null;
  const selectedMother = selected ? QUESTION_MOTHERS.find((mother) => mother.questionIds.includes(selected.id)) || QUESTION_MOTHERS.find((mother) => mother.id === inferMotherId(selected.prompt)) : null;
  const practiced = questions.filter((question) => question.bestAttempt).length;

  const toggleFavorite = (id: string) => setFavorites((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id);
    localStorage.setItem("steady-question-favorites", JSON.stringify([...next])); return next;
  });
  const toggleGroup = (id: string) => setCollapsed((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <main className="questionMapPage">
    <nav><a href="/library"><ArrowLeft size={17}/> Question bank</a><div className="brand"><span className="brandMark">S</span> Steady</div><span>{questions.length} questions · {practiced} with Best</span></nav>
    <header className="mapHero"><span>QUESTION RELATIONSHIP MAP</span><h1>See the pattern.<br/><em>Twist the evidence.</em></h1><p>Each branch groups questions that test the same underlying skill. Use it to see where one story can travel—and what must change in the telling.</p></header>
    <section className="mapToolbar" aria-label="Question map controls">
      <label><Search size={17}/><input value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search a question or mother theme…"/></label>
      <div className="mapViewToggle"><button className={!favoritesOnly?"active":""} onClick={()=>setFavoritesOnly(false)}>All questions</button><button className={favoritesOnly?"active":""} onClick={()=>setFavoritesOnly(true)}><Bookmark size={15} fill={favoritesOnly?"currentColor":"none"}/> Favorites</button></div>
      <button className="collapseAll" onClick={()=>setCollapsed(collapsed.size?new Set():new Set(QUESTION_MOTHERS.map((mother)=>mother.id)))}>{collapsed.size?"Expand all":"Collapse all"}</button>
    </section>
    <section className="mapSummary" aria-label="Map summary"><div><MapIcon size={18}/><b>{groups.length}</b><span>mother themes visible</span></div><div><Star size={18}/><b>{practiced}</b><span>questions with a Best Answer</span></div><p>The connecting line means “same underlying interview signal,” not “same wording.”</p></section>
    {loading ? <p className="mapEmpty">Building your map…</p> : error ? <section className="storyLoadError"><b>Question Map couldn’t load.</b><p>{error}</p><button onClick={()=>setLoadKey((value)=>value+1)}><RefreshCw size={15}/> Try again</button></section> : groups.length ? <section className="motherTree">
      {groups.map((mother) => {
        const isCollapsed = collapsed.has(mother.id); const bestCount = mother.questions.filter((question)=>question.bestAttempt).length;
        return <article className={`motherBranch ${isCollapsed?"collapsed":""}`} key={mother.id}>
          <button className="motherNode" onClick={()=>toggleGroup(mother.id)} aria-expanded={!isCollapsed}>
            <span>MOTHER QUESTION · {mother.questions.length}</span><h2>{mother.title}</h2><p>{mother.corePrompt}</p><small>{bestCount}/{mother.questions.length} with Best Answer</small><ChevronDown size={19}/>
          </button>
          {!isCollapsed&&<div className="branchLine" aria-hidden="true"/>}
          {!isCollapsed&&<div className="childQuestions">{mother.questions.map((question)=>{
            const favorite=favorites.has(question.id); const best=question.bestAttempt;
            return <button className={`questionNode ${best?"answered":""} ${favorite?"favorite":""}`} key={question.id} onClick={()=>setSelectedId(question.id)}>
              <span className="twistLabel">{questionTwist(question.category,question.prompt)}</span><h3>{question.prompt}</h3><footer>{best?<span><Star size={13} fill="currentColor"/> Best {best.feedback?.score||"—"}/5</span>:<span>No Best yet</span>}<ArrowRight size={15}/></footer>
            </button>})}</div>}
        </article>
      })}
    </section> : <p className="mapEmpty">{favoritesOnly?"No favorite questions match this view yet.":"No questions match your search."}</p>}
    {selected&&<div className="mapDrawerBackdrop" onMouseDown={(event)=>{if(event.target===event.currentTarget)setSelectedId(null)}}><aside className="mapDrawer" role="dialog" aria-modal="true" aria-labelledby="map-question-title">
      <button className="drawerClose" onClick={()=>setSelectedId(null)} aria-label="Close question details"><X size={20}/></button>
      <span>{selectedMother?.title||"Saved AI variant"}</span><h2 id="map-question-title">{selected.prompt}</h2>
      <div className="drawerTwist"><b>How this version twists the mother question</b><p>{questionTwist(selected.category,selected.prompt)}. Keep the underlying evidence consistent, but move this decision or signal to the foreground.</p></div>
      {selectedMother&&<div className="drawerMother"><b>Reusable answer spine</b><p>{selectedMother.description}</p></div>}
      <div className="drawerBest"><div><b>Best Answer</b><button onClick={()=>toggleFavorite(selected.id)} aria-pressed={favorites.has(selected.id)}><Bookmark size={16} fill={favorites.has(selected.id)?"currentColor":"none"}/>{favorites.has(selected.id)?"Saved":"Favorite"}</button></div>
        {selected.bestAttempt?<><p>{selected.bestAttempt.polishedAnswer||selected.bestAttempt.repairedTranscript||selected.bestAttempt.transcript}</p>{selected.bestAttempt.polishReview?.status==="needs-details"&&<small>AI review found missing evidence · open Question Bank to see what to add</small>}<small>{selected.bestAttempt.feedback?.score||"—"}/5 · {selected.bestAttempt.wpm} wpm · {selected.attemptCount} saved answer{selected.attemptCount===1?"":"s"}</small></>:<p className="noBest">You have not selected a Best Answer for this question yet.</p>}
      </div>
      <div className="drawerActions"><a href={`/practice?questionId=${encodeURIComponent(selected.id)}&questionText=${encodeURIComponent(selected.prompt)}&category=${encodeURIComponent(selected.category)}`}><Mic size={16}/> Practice this question</a><a href={`/library#question-${encodeURIComponent(selected.id)}`}>Open in Question Bank <ArrowRight size={16}/></a></div>
    </aside></div>}
  </main>;
}
