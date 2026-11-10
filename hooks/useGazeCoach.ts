"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Direction = "center" | "left" | "right" | "up" | "down";
export type GazePattern = "steady" | "natural_recall" | "sustained_away" | "possible_reading" | "insufficient_data";
type Episode = { direction: Direction; startedAt: number; endedAt: number };
type Snapshot = { awaySeconds: number; longestAwaySeconds: number; awayEpisodes: number; repeatedDirectionRatio: number; horizontalSwitches: number; pattern: GazePattern; confidence: number };
type FaceTracker = { close?: () => void; detectForVideo: (video: HTMLVideoElement, time: number) => { faceBlendshapes?: Array<{ categories: Array<{ categoryName: string; score: number }> }> } };

export function useGazeCoach(videoRef: React.RefObject<HTMLVideoElement | null>, measuring: boolean) {
  const [status, setStatus] = useState<Direction | "unavailable" | "calibrating">("calibrating");
  const [calibrated, setCalibrated] = useState(false);
  const [gazePoint, setGazePoint] = useState({ x: .5, y: .5, visible: false });
  const tracker = useRef<FaceTracker | null>(null);
  const measuringRef = useRef(measuring);
  const currentEpisode = useRef<{ direction: Direction; startedAt: number } | null>(null);
  const episodes = useRef<Episode[]>([]);
  const samples = useRef(0);
  const baseline = useRef<number[]>([]);

  useEffect(() => { measuringRef.current = measuring; }, [measuring]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm");
        const model = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task", delegate: "GPU" },
          runningMode: "VIDEO", outputFaceBlendshapes: true, numFaces: 1,
        });
        if (!cancelled) tracker.current = model;
      } catch { if (!cancelled) setStatus("unavailable"); }
    })();
    return () => { cancelled = true; tracker.current?.close?.(); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const video = videoRef.current;
      if (!video || video.readyState < 2 || !tracker.current) return;
      try {
        const categories = tracker.current.detectForVideo(video, performance.now()).faceBlendshapes?.[0]?.categories || [];
        if (!categories.length) return;
        const score = (name: string) => categories.find((c) => c.categoryName === name)?.score || 0;
        const directional = {
          left: (score("eyeLookOutLeft") + score("eyeLookInRight")) / 2,
          right: (score("eyeLookInLeft") + score("eyeLookOutRight")) / 2,
          up: (score("eyeLookUpLeft") + score("eyeLookUpRight")) / 2,
          down: (score("eyeLookDownLeft") + score("eyeLookDownRight")) / 2,
        };
        // Blendshape values describe direction, not literal screen pixels. Map the
        // binocular difference into normalized viewport space and smooth it so the
        // feedback remains readable rather than mirroring every microsaccade.
        const rawX = Math.max(.06, Math.min(.94, .5 + (directional.right - directional.left) * 1.35));
        const rawY = Math.max(.08, Math.min(.92, .5 + (directional.down - directional.up) * 1.25));
        setGazePoint((old) => ({ x: old.x * .72 + rawX * .28, y: old.y * .72 + rawY * .28, visible: true }));
        const peak = Math.max(...Object.values(directional));
        if (!measuringRef.current && baseline.current.length < 45) {
          baseline.current.push(peak);
          if (baseline.current.length >= 30) setCalibrated(true);
          setStatus("calibrating");
          return;
        }
        const sorted = [...baseline.current].sort((a,b) => a-b);
        const median = sorted[Math.floor(sorted.length / 2)] || .12;
        const threshold = Math.max(.34, median + .18);
        const direction = Object.entries(directional).sort((a,b) => b[1] - a[1])[0][0] as Exclude<Direction,"center">;
        const next: Direction = peak > threshold ? direction : "center";
        setStatus(next);
        if (!measuringRef.current) return;
        samples.current++;
        const now = Date.now();
        if (next !== "center" && !currentEpisode.current) currentEpisode.current = { direction: next, startedAt: now };
        if (currentEpisode.current && (next === "center" || next !== currentEpisode.current.direction)) {
          episodes.current.push({ ...currentEpisode.current, endedAt: now });
          currentEpisode.current = next === "center" ? null : { direction: next, startedAt: now };
        }
      } catch { setGazePoint((old) => ({ ...old, visible: false })); }
    }, 250);
    return () => window.clearInterval(timer);
  }, [videoRef]);

  const reset = useCallback(() => { episodes.current = []; currentEpisode.current = null; samples.current = 0; }, []);
  const snapshot = useCallback((): Snapshot => {
    const complete = [...episodes.current];
    if (currentEpisode.current) complete.push({ ...currentEpisode.current, endedAt: Date.now() });
    const meaningful = complete.filter((e) => e.endedAt - e.startedAt >= 500);
    const durations = meaningful.map((e) => (e.endedAt - e.startedAt) / 1000);
    const awaySeconds = durations.reduce((a,b) => a+b, 0);
    const counts = meaningful.reduce<Record<string,number>>((acc,e) => ({...acc,[e.direction]:(acc[e.direction]||0)+1}),{});
    const repeatedDirectionRatio = meaningful.length ? Math.max(...Object.values(counts)) / meaningful.length : 0;
    const horizontal = meaningful.filter((e) => e.direction === "left" || e.direction === "right");
    const horizontalSwitches = horizontal.slice(1).filter((e,i) => e.direction !== horizontal[i].direction).length;
    const longestAwaySeconds = durations.length ? Math.max(...durations) : 0;
    let pattern: GazePattern = "steady"; let confidence = .7;
    if (samples.current < 20) { pattern = "insufficient_data"; confidence = .25; }
    else if (horizontalSwitches >= 3 && meaningful.length >= 5) { pattern = "possible_reading"; confidence = Math.min(.9, .55 + horizontalSwitches * .07); }
    else if (meaningful.length >= 3 && repeatedDirectionRatio >= .7 && awaySeconds >= 6) { pattern = "possible_reading"; confidence = .68; }
    else if (longestAwaySeconds >= 5) { pattern = "sustained_away"; confidence = .76; }
    else if (meaningful.some((e,i) => e.direction === "up" && durations[i] <= 4) || (meaningful.length <= 3 && longestAwaySeconds <= 4)) { pattern = "natural_recall"; confidence = .66; }
    return { awaySeconds, longestAwaySeconds, awayEpisodes: meaningful.length, repeatedDirectionRatio, horizontalSwitches, pattern, confidence };
  }, []);
  return { status, snapshot, reset, calibrated, gazePoint };
}
