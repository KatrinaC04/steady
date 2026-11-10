"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, GripVertical, Maximize2, Mic, RefreshCw, RotateCcw, Search, X } from "lucide-react";

type CompetencyLink = { competency: string; question: string; questionId: string; answer?: string; score?: number | null };
type Story = { id: string; title: string; organization: string; summary: string; facts: string[]; attemptCount: number; competencyLinks: CompetencyLink[] };
type MotivationItem = CompetencyLink & { id: string; label: string };
type Selection = { key: string; title: string; organization: string; family: string; facts: string[]; link: CompetencyLink };

const BQ_FAMILIES = ["Leadership", "Conflict", "Failure", "Prioritization", "Customer", "Data", "Ambiguity", "Collaboration", "Communication", "Execution", "Innovation"] as const;
const ORDER_KEY = "steady-story-bank-order-v1";

function familyFor(competency: string) {
  const value = competency.toLowerCase();
  if (/leadership|ownership/.test(value)) return "Leadership";
  if (/conflict|disagree|influence|trade-off/.test(value)) return "Conflict";
  if (/failure|feedback|growth mindset|self-awareness/.test(value)) return "Failure";
  if (/prioriti|quality versus speed|product trade|calculated risk/.test(value)) return "Prioritization";
  if (/customer|product judgment|favorite product|microsoft product/.test(value)) return "Customer";
  if (/data|metric|experiment/.test(value)) return "Data";
  if (/ambigu|initiative|zero-to-one/.test(value)) return "Ambiguity";
  if (/collaboration|cross-functional/.test(value)) return "Collaboration";
  if (/communication|persuasion|explaining/.test(value)) return "Communication";
  if (/execution|process|deadline|speed/.test(value)) return "Execution";
  if (/innovation|creative|technology|technical depth|resume deep dive/.test(value)) return "Innovation";
  if (/motivation|career|role fit|narrative/.test(value)) return "Motivation";
  return "Innovation";
}

function defaultOrder(stories: Story[]) {
  return [...stories].sort((a, b) => b.competencyLinks.length - a.competencyLinks.length || a.organization.localeCompare(b.organization) || a.title.localeCompare(b.title)).map((story) => story.id);
}

export default function StoryBank() {
  const [stories, setStories] = useState<Story[]>([]);
  const [motivations, setMotivations] = useState<MotivationItem[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadKey, setLoadKey] = useState(0);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const [popoverSize, setPopoverSize] = useState<{ width: number; height: number } | null>(null);
  const popoverRef = useRef<HTMLElement>(null);
  const popoverDragOffset = useRef<{ x: number; y: number } | null>(null);
  const popoverResizeStart = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  useEffect(() => {
    const controller = new AbortController(); const timeout = window.setTimeout(() => controller.abort(), 15000);
    setLoading(true); setError("");
    fetch("/api/story-bank", { cache: "no-store", signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error(`Request failed (${response.status})`); return response.json(); })
      .then((data) => {
        const next = Array.isArray(data.stories) ? data.stories as Story[] : [];
        setStories(next);
        setMotivations(Array.isArray(data.motivations) ? data.motivations as MotivationItem[] : []);
        let saved: string[] = []; try { saved = JSON.parse(localStorage.getItem(ORDER_KEY) || "[]"); } catch {}
        const valid = saved.filter((id) => next.some((story) => story.id === id));
        const missing = defaultOrder(next).filter((id) => !valid.includes(id));
        setOrder([...valid, ...missing]);
      })
      .catch((reason) => setError(reason?.name === "AbortError" ? "The Story Bank took too long to load." : reason?.message || "Could not load the Story Bank."))
      .finally(() => { window.clearTimeout(timeout); setLoading(false); });
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [loadKey]);

  useEffect(() => {
    if (!selection) return;
    const close = (event: PointerEvent) => { if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) setSelection(null); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [selection]);

  const companies = useMemo(() => Array.from(new Set(stories.map((story) => story.organization))).sort(), [stories]);
  const ordered = useMemo(() => order.map((id) => stories.find((story) => story.id === id)).filter((story): story is Story => Boolean(story)), [order, stories]);
  const visible = useMemo(() => ordered.filter((story) => (company === "all" || story.organization === company) && `${story.organization} ${story.title} ${story.summary} ${story.facts.join(" ")} ${story.competencyLinks.map((link) => `${link.competency} ${link.question}`).join(" ")}`.toLowerCase().includes(query.toLowerCase())), [ordered, company, query]);
  const visibleMotivations = useMemo(() => motivations.filter((item) => `${item.label} ${item.question} ${item.answer || ""}`.toLowerCase().includes(query.toLowerCase())), [motivations, query]);
  const linksFor = (story: Story, family: string) => story.competencyLinks.filter((link) => familyFor(link.competency) === family);
  const primaryLinkFor = (story: Story, family: string) => linksFor(story, family).sort((a, b) => (b.score || 0) - (a.score || 0) || Number(Boolean(b.answer)) - Number(Boolean(a.answer)))[0];
  const saveOrder = (next: string[]) => { setOrder(next); localStorage.setItem(ORDER_KEY, JSON.stringify(next)); };
  const moveBefore = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    const next = order.filter((id) => id !== draggedId); next.splice(next.indexOf(targetId), 0, draggedId); saveOrder(next); setDraggedId(null);
  };
  const resetOrder = () => saveOrder(defaultOrder(stories));
  const movePopover = (event: React.PointerEvent<HTMLElement>) => {
    if (!popoverDragOffset.current || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(event.clientX - popoverDragOffset.current.x, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(event.clientY - popoverDragOffset.current.y, window.innerHeight - Math.min(rect.height, window.innerHeight - 16) - 8));
    setPopoverPosition({ left, top });
  };
  const stopMovingPopover = (event: React.PointerEvent<HTMLElement>) => {
    popoverDragOffset.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const startResizingPopover = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    setPopoverPosition({ left: rect.left, top: rect.top });
    setPopoverSize({ width: rect.width, height: rect.height });
    popoverResizeStart.current = { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };
  const resizePopover = (event: React.PointerEvent<HTMLButtonElement>) => {
    const start = popoverResizeStart.current;
    if (!start || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    const maxWidth = Math.max(320, window.innerWidth - rect.left - 8);
    const maxHeight = Math.max(260, window.innerHeight - rect.top - 8);
    setPopoverSize({
      width: Math.min(maxWidth, Math.max(320, start.width + event.clientX - start.x)),
      height: Math.min(maxHeight, Math.max(260, start.height + event.clientY - start.y)),
    });
  };
  const stopResizingPopover = (event: React.PointerEvent<HTMLButtonElement>) => {
    popoverResizeStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const resizePopoverWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!popoverRef.current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    const rect = popoverRef.current.getBoundingClientRect();
    const step = event.shiftKey ? 40 : 16;
    const widthDelta = event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0;
    const heightDelta = event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0;
    setPopoverPosition({ left: rect.left, top: rect.top });
    setPopoverSize({
      width: Math.min(window.innerWidth - rect.left - 8, Math.max(320, rect.width + widthDelta)),
      height: Math.min(window.innerHeight - rect.top - 8, Math.max(260, rect.height + heightDelta)),
    });
    event.preventDefault();
  };

  return <main className="libraryPage storyCheatPage">
    <nav><a href="/"><ArrowLeft size={17}/> Interview room</a><div className="brand"><span className="brandMark">S</span> Steady</div><a href="/library">Question library</a></nav>
    <section className="cheatTools"><label><Search size={16}/><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search story, company, metric, or BQ…"/></label><select value={company} onChange={(event) => setCompany(event.target.value)}><option value="all">All experience sources</option>{companies.map((name) => <option key={name}>{name}</option>)}</select><button className="resetStoryOrder" onClick={resetOrder}><RotateCcw size={14}/> Default order</button></section>
    {loading ? <p className="libraryEmpty">Building your story bank…</p> : error ? <section className="storyLoadError"><b>Story Bank couldn’t load.</b><p>{error}</p><button onClick={() => setLoadKey((value) => value + 1)}><RefreshCw size={15}/> Try again</button></section> : <>
      {visibleMotivations.length > 0 && <section className="motivationStrip" aria-label="Motivation and personal narrative answers"><div className="motivationRow">{visibleMotivations.map((item, index) => { const selected = selection?.key === `motivation-${item.id}`; return <button key={item.id} className={selected ? "selected" : ""} onClick={(event) => { event.stopPropagation(); setSelection({ key: `motivation-${item.id}`, title: item.label, organization: "Personal narrative", family: "Motivation", facts: [], link: item }); }}><small>{String(index + 1).padStart(2, "0")}</small><b>{item.label}</b><span>{item.score ? `${item.score}/5 · Best answer saved` : item.answer ? "Best answer saved" : "Not practiced yet"}</span></button>; })}</div></section>}
      <section className="coverageMatrix"><div className="matrixScroll"><table><thead><tr><th className="storyColumn">Core story</th>{BQ_FAMILIES.map((family) => <th key={family}><span>{family}</span></th>)}</tr></thead><tbody>{visible.map((story) => <tr key={story.id} draggable onDragStart={() => setDraggedId(story.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => moveBefore(story.id)}><th className="storyColumn"><GripVertical className="storyDrag" size={16}/><span>{story.organization}</span><b>{story.title}</b><small>{story.facts[0]}</small></th>{BQ_FAMILIES.map((family) => { const link = primaryLinkFor(story, family); const covered = Boolean(link); const selected = selection?.key === `${story.id}-${family}`; return <td key={family}><button className={`${covered ? "covered" : ""} ${selected ? "selected" : ""}`} disabled={!link} onClick={(event) => { event.stopPropagation(); if (link) setSelection({ key: `${story.id}-${family}`, title: story.title, organization: story.organization, family, facts: story.facts, link }); }} aria-label={covered ? `${story.title}: open ${family} answer` : `${story.title}: no ${family} answer`}><Check size={14}/></button></td>; })}</tr>)}</tbody></table></div></section>
    </>}
    {!loading && !error && !visible.length && <p className="libraryEmpty">No matching stories.</p>}
    <div className="storyScrollSpace" aria-hidden="true"/>
    {selection && <section className="storyAnswerPopover storyAnswerSplit" ref={popoverRef} style={{ ...(popoverPosition ? { left: popoverPosition.left, top: popoverPosition.top, transform: "none" } : {}), ...(popoverSize ? { width: popoverSize.width, height: popoverSize.height } : {}) }} aria-label={`${selection.title} ${selection.family} answer`}>
      <aside className="popoverContext" title="Drag to move · Double-click to reset" onPointerDown={(event) => { if ((event.target as HTMLElement).closest("button") || !popoverRef.current) return; const rect = popoverRef.current.getBoundingClientRect(); popoverDragOffset.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }; setPopoverPosition({ left: rect.left, top: rect.top }); event.currentTarget.setPointerCapture(event.pointerId); event.preventDefault(); }} onPointerMove={movePopover} onPointerUp={stopMovingPopover} onPointerCancel={stopMovingPopover} onDoubleClick={() => { setPopoverPosition(null); setPopoverSize(null); }}>
        <span>{selection.organization} · {selection.family}</span>
        <h2>{selection.title}</h2>
        <div className="popoverQuestion"><b>{selection.link.competency}</b><p>{selection.link.question}</p><small>{selection.link.score ? `${selection.link.score}/5` : "BEST"}</small></div>
        {selection.facts.length > 0 && <div className="popoverAnchors">{selection.facts.map((fact) => <span key={fact}>{fact}</span>)}</div>}
      </aside>
      <button className="popoverClose" onClick={() => setSelection(null)} aria-label="Close"><X size={20}/></button>
      <div className="popoverAnswerPane">
        <p>{selection.link.answer || "No saved full answer for this angle yet."}</p>
        <a href={`/practice?questionId=${encodeURIComponent(selection.link.questionId)}`}><Mic size={16}/> Practice this answer</a>
        <div className="popoverScrollTail" aria-hidden="true"/>
      </div>
      <button className="popoverResizeHandle" aria-label="Resize answer window. Use arrow keys to adjust size." title="Drag to resize" onPointerDown={startResizingPopover} onPointerMove={resizePopover} onPointerUp={stopResizingPopover} onPointerCancel={stopResizingPopover} onKeyDown={resizePopoverWithKeyboard}><Maximize2 size={15}/></button>
    </section>}
  </main>;
}
