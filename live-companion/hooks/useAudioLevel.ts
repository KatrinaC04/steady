"use client";

import { useEffect, useState } from "react";

// Live input level (0–1) for the "test audio" meter. Analysis only: nothing is played back or recorded.
export function useAudioLevel(stream: MediaStream | null) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream?.getAudioTracks().length) { setLevel(0); return; }
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    analyser.fftSize = 1024;
    context.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const timer = window.setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      const rms = Math.sqrt(samples.reduce((sum, value) => sum + value * value, 0) / samples.length);
      // Speech RMS sits roughly between 0.01 and 0.3; map it onto a perceptual 0–1 scale.
      setLevel(Math.min(1, Math.max(0, (20 * Math.log10(rms || 1e-6) + 60) / 50)));
    }, 100);
    return () => { window.clearInterval(timer); void context.close(); };
  }, [stream]);
  return level;
}
