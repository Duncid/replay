import { useTranslation } from "react-i18next";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NoteHighway } from "@/components/highway/NoteHighway";
import type { HighwayTransport } from "@/components/highway/model";
import { PianoKey } from "@/components/PianoKey";
import { NoteRail, type RailNoteState } from "@/components/NoteRail";
import { createAdaptivePianoLayout, pianoLayoutKey, pianoKeyStyle, pianoBreaks, pianoBreakStyle } from "@/components/pianoLayout";
import { useTonePiano } from "@/hooks/useTonePiano";
import { formatDemoTime, type DemoTune } from "./demoScore";
import { useGuestEntry } from "./GuestEntryContext";

export type DemoSound = "silent" | "loading" | "playing" | "blocked" | "error";
export interface LivePracticeHandle { play: () => void }
const ignoreInput = () => {};

/** Read-only performance: production renderer, keys and samples, without practice/account services. */
const LivePracticePreview = forwardRef<LivePracticeHandle, {
  tune: DemoTune; displayTitle: string; paused: boolean; departing?: boolean; onReady: () => void; onError: () => void; onSoundChange: (state: DemoSound) => void;
}>(function LivePracticePreview({ tune, displayTitle, paused, departing = false, onReady, onError, onSoundChange }, ref) {
  const { t } = useTranslation();
  const { notes: demoNotes, highwayNotes, duration, beatsPerSecond, bpm, range } = tune;
  const { keyboardWidth, setPreviewPitches } = useGuestEntry();
  const pitches = useMemo(() => demoNotes.map(note => note.midi), [demoNotes]);
  const layout = useMemo(() => createAdaptivePianoLayout(pitches, keyboardWidth), [pitches, keyboardWidth]);
  useLayoutEffect(() => {
    setPreviewPitches(pitches);
    return () => setPreviewPitches([]);
  }, [pitches, setPreviewPitches]);
  const host = useRef<HTMLDivElement>(null);
  const timeLabel = useRef<HTMLSpanElement>(null);
  const progress = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(!document.hidden);
  const [ready, setReady] = useState(false);
  const [keys, setKeys] = useState<string[]>([]);
  const [sampleRequested, setSampleRequested] = useState(true);
  const [audioFailed, setAudioFailed] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [departureFinished, setDepartureFinished] = useState(false);
  const departingRef = useRef(departing);
  departingRef.current = departing;
  const volume = useRef(.05);
  const audio = useTonePiano(sampleRequested ? "acoustic-piano" : null, .05);
  const audioRef = useRef(audio);
  audioRef.current = audio;
  const mounted = useRef(true);
  const seconds = useRef(-2); // Let the first note approach, rather than start on a hit.
  const cycle = useRef(0);
  const activeIds = useRef(new Set<string>());
  const playing = ready && !paused && !departureFinished && visible && foreground;
  const sounding = sampleRequested && audioUnlocked && audio.isLoaded;
  const transport = useRef<HighwayTransport>({
    getBeat: () => seconds.current * beatsPerSecond,
    getState: () => "paused", getActive: () => activeIds.current, resetId: 0,
  });
  transport.current.getBeat = () => seconds.current * beatsPerSecond;
  transport.current.getState = () => playing ? "playing" : "paused";

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);
  const requestSound = useCallback(() => {
    if (departingRef.current) return;
    // Attempt on arrival, and retry synchronously in a gesture if the browser blocks autoplay.
    setAudioFailed(false);
    setAutoplayBlocked(false);
    setSampleRequested(true);
    void audioRef.current.ensureAudioReady().then(() => {
      if (mounted.current && !departingRef.current) { setAudioUnlocked(true); setAutoplayBlocked(false); }
    }).catch(() => {
      if (mounted.current) setAutoplayBlocked(true);
    });
  }, []);
  useImperativeHandle(ref, () => ({ play: requestSound }), [requestSound]);
  useEffect(() => { requestSound(); }, [requestSound]);
  useEffect(() => {
    if (!departing) {
      setDepartureFinished(false);
      audioRef.current.setSampleVolume(volume.current);
      return;
    }
    audioRef.current.setSampleVolume(0, .15);
    if (host.current) host.current.dataset.volume = "0.000";
    const timeout = setTimeout(() => setDepartureFinished(true), 150);
    return () => clearTimeout(timeout);
  }, [departing]);
  useEffect(() => {
    if (audioUnlocked || !sampleRequested) return;
    // A blocked AudioContext.resume() may stay pending instead of rejecting.
    const timeout = window.setTimeout(() => setAutoplayBlocked(true), 1000);
    return () => clearTimeout(timeout);
  }, [audioUnlocked, sampleRequested]);
  useEffect(() => {
    if (audioUnlocked || paused || audioFailed) return;
    const interact = (event: Event) => {
      // The Play button handles its own click; don't race its Pause state on pointerdown.
      if (event.target instanceof Element && event.target.closest("button, a, input, textarea, select")) return;
      requestSound();
    };
    window.addEventListener("pointerdown", interact);
    window.addEventListener("keydown", interact);
    return () => {
      window.removeEventListener("pointerdown", interact);
      window.removeEventListener("keydown", interact);
    };
  }, [audioUnlocked, paused, audioFailed, requestSound]);
  useEffect(() => {
    onSoundChange(audioFailed ? "error" : paused ? "silent" : autoplayBlocked ? "blocked" : sounding ? "playing" : "loading");
  }, [audioFailed, paused, autoplayBlocked, sounding, onSoundChange]);
  useEffect(() => {
    if (!sampleRequested || audio.isLoaded) return;
    const timeout = window.setTimeout(() => { setSampleRequested(false); setAudioFailed(true); }, 15_000);
    return () => clearTimeout(timeout);
  }, [sampleRequested, audio.isLoaded]);

  useEffect(() => {
    const pointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    const setVolume = (gain: number) => {
      if (departingRef.current) return;
      // Keep the cap here, before any sampler exists, as well as on every move.
      const capped = Math.max(0, Math.min(.3, gain));
      volume.current = capped;
      audioRef.current.setSampleVolume(capped);
      if (host.current) host.current.dataset.volume = capped.toFixed(3);
    };
    const move = (event: PointerEvent) => {
      if (!pointer.matches || navigator.maxTouchPoints > 0 || event.pointerType !== "mouse") return;
      const x = (event.clientX / window.innerWidth - .5) * 2;
      const y = (event.clientY / window.innerHeight - .5) * 2;
      const proximity = 1 - Math.min(1, Math.hypot(x, y));
      const eased = proximity * proximity * (3 - 2 * proximity);
      setVolume(.05 + .25 * eased);
    };
    const leave = () => { if (pointer.matches && navigator.maxTouchPoints === 0) setVolume(.05); };
    const reset = () => setVolume(.05);
    reset();
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    window.addEventListener("blur", leave);
    pointer.addEventListener("change", reset);
    return () => {
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", leave);
      window.removeEventListener("blur", leave);
      pointer.removeEventListener("change", reset);
    };
  }, []);

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    // Layout pixels, not transformed bounding boxes: the outer iPad is tilted in 3D.
    const resize = new ResizeObserver(([entry]) => element.style.setProperty("--demo-scale", String(entry.contentRect.width / 1194)));
    resize.observe(element);
    const intersection = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    intersection.observe(element);
    const visibility = () => setForeground(!document.hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => { resize.disconnect(); intersection.disconnect(); document.removeEventListener("visibilitychange", visibility); };
  }, []);

  useEffect(() => {
    seconds.current = -2;
    cycle.current = 0;
    activeIds.current = new Set();
    transport.current.resetId = tune.key;
    setKeys([]);
    if (timeLabel.current) timeLabel.current.textContent = `0:00 / ${formatDemoTime(duration)}`;
    if (progress.current) progress.current.style.transform = "scaleX(0)";
  }, [tune, duration]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0, previous = performance.now(), lastKeys = "", lastSecond = -Infinity;
    const voices = new Map<string, string>();
    const tick = (now: number) => {
      seconds.current += Math.max(0, (now - previous) / 1000);
      previous = now;
      if (seconds.current >= duration) {
        seconds.current %= duration;
        cycle.current++;
        transport.current.resetId = `${tune.key}:${cycle.current}`;
      }
      const current = demoNotes.filter(note => note.start <= seconds.current && note.end > seconds.current);
      activeIds.current = new Set(current.map(note => `0:${note.id}`));
      const names = [...new Set(current.map(note => note.name))];
      const key = names.join(",");
      if (key !== lastKeys) { lastKeys = key; setKeys(names); }
      // Track note IDs, so repeated same-pitch notes retrigger at their onset.
      const desired = new Map(sounding ? current.map(note => [note.name, `${cycle.current}:${note.id}`]) : []);
      for (const [name, id] of voices) if (desired.get(name) !== id) { audioRef.current.stopNote(name); voices.delete(name); }
      for (const [name, id] of desired) if (voices.get(name) !== id) { audioRef.current.startNote(name); voices.set(name, id); }
      const wholeSecond = Math.floor(Math.max(0, seconds.current));
      if (wholeSecond !== lastSecond) {
        lastSecond = wholeSecond;
        if (timeLabel.current) timeLabel.current.textContent = `${Math.floor(wholeSecond / 60)}:${String(wholeSecond % 60).padStart(2, "0")} / ${formatDemoTime(duration)}`;
      }
      if (progress.current) progress.current.style.transform = `scaleX(${Math.max(0, seconds.current) / duration})`;
      if (host.current) { host.current.dataset.time = seconds.current.toFixed(3); host.current.dataset.cycle = String(cycle.current); }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(frame); for (const name of voices.keys()) audioRef.current.stopNote(name); };
  }, [playing, sounding, tune, demoNotes, duration]);

  const readiness = useCallback((state: "loading" | "ready" | "error") => {
    // Once revealed, keep the DOM keyboard visible while the highway changes
    // ranges. Hiding it exposes the old screenshot's differently sized keys.
    if (state === "ready") { setReady(true); onReady(); }
    if (state === "error") onError();
  }, [onReady, onError]);
  const states: Record<string, RailNoteState> = Object.fromEntries(layout.notes.map(note => {
    const name = `${note.note}${note.octave}`;
    return [name, { label: name, playable: true, activity: keys.includes(name) ? "user" : undefined,
      inRange: note.midi >= range[0] && note.midi <= range[1] }];
  }));
  return <div ref={host} className="landing-live-preview" data-ready={ready} data-playing={playing}
    data-note-count={demoNotes.length} data-duration={duration} data-tune={tune.key} data-audio-policy={audioUnlocked ? "unlocked" : autoplayBlocked ? "blocked" : "pending"} data-sound={sounding && playing ? "acoustic-piano" : "silent"}
    role="img" aria-label={t("landing.live", { title: displayTitle })}>
    <div className="landing-demo-app" aria-hidden="true" inert>
      <div className="landing-demo-highway"><NoteHighway notes={highwayNotes} transport={transport.current}
        layout={layout} range={range} pixelsPerBeat={90} beatsPerSecond={beatsPerSecond} onReadinessChange={readiness} /></div>
      <header className="landing-demo-header"><span className="landing-demo-brand">Noodlyn</span></header>
      <div className="landing-demo-title"><h2>{displayTitle}</h2>{tune.composer && <p>{tune.composer}</p>}</div>
      <div className="landing-demo-piano">
        <div className="landing-demo-toolbar"><span>{t("landing.instrument")}</span><span>{t("landing.tempo", { bpm: Math.round(bpm) })} <span className="landing-demo-time" ref={timeLabel}>0:00 / {formatDemoTime(duration)}</span></span></div>
        <div className="landing-demo-keys piano-surface" data-piano-ranges={pianoLayoutKey(layout)}><NoteRail layout={layout} states={states} />
          <div data-preview-keys className="relative flex-1 min-h-0">{pianoBreaks(layout).map(note => <div key={note.midi} className="piano-range-break" style={pianoBreakStyle(layout, note)} />)}{[...layout.whiteKeys, ...layout.blackKeys].map(note => {
            const name = `${note.note}${note.octave}`;
            return <PianoKey key={name} note={name} style={pianoKeyStyle(layout, note)} isBlack={note.isBlack}
              activity={states[name].activity} isPlayable disabled onPress={ignoreInput} onRelease={ignoreInput} />;
          })}</div>
        </div>
      </div>
      <div className="landing-demo-progress" ref={progress} />
    </div>
  </div>;
});
export default LivePracticePreview;
