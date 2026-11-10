"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((event: { resultIndex: number; results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

export function useSpeechCoach(language: string) {
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [supported, setSupported] = useState(true);
  const [lastActivityAt, setLastActivityAt] = useState(0);
  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const active = useRef(false);

  useEffect(() => {
    const w = window as typeof window & { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike };
    const Constructor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Constructor) { setSupported(false); return; }
    const instance = new Constructor();
    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = language === "中文" ? "zh-CN" : "en-US";
    instance.onresult = (event) => {
      setLastActivityAt(Date.now());
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finalText += result[0].transcript + " ";
        else interimText += result[0].transcript;
      }
      if (finalText) setTranscript((old) => old + finalText);
      setInterim(interimText);
    };
    instance.onend = () => { if (active.current) { try { instance.start(); } catch {} } };
    recognition.current = instance;
    return () => { active.current = false; instance.stop(); };
  }, [language]);

  const start = useCallback(() => {
    setTranscript(""); setInterim(""); setLastActivityAt(Date.now()); active.current = true;
    try { recognition.current?.start(); } catch {}
  }, []);
  const resume = useCallback(() => { active.current = true; try { recognition.current?.start(); } catch {} }, []);
  const stop = useCallback(() => { active.current = false; recognition.current?.stop(); }, []);
  const reset = useCallback(() => { setTranscript(""); setInterim(""); }, []);

  return { transcript: (transcript + interim).trim(), finalTranscript: transcript.trim(), interimTranscript: interim.trim(), supported, lastActivityAt, start, resume, stop, reset };
}
