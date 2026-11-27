import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { HighwayProvider } from "@/components/highway/HighwayContext";
import { PianoDock } from "@/components/highway/PianoDock";
import Piano, { type PianoHandle } from "@/components/Piano";
import { PianoInput } from "@/components/PianoInput";
import { KeyboardSettings, type DisplayNotesPreference } from "@/components/KeyboardSettings";
import { Metronome, type FeelPreset, type MetronomeSoundType } from "@/components/Metronome";
import { TuneLibrary } from "@/components/TuneLibrary";
import { TuneMode } from "@/components/modes/TuneMode";
import { Button } from "@/components/ui/button";
import { GuestSignUpDialog } from "@/components/GuestSignUpDialog";
import { useMidiInput } from "@/hooks/useMidiInput";
import { useMidiSoundPreference } from "@/hooks/useMidiSoundPreference";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import type { PianoSoundType } from "@/hooks/usePianoSound";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { useMicTranscriptionInputAdapter } from "@/inputAdapters/MicTranscriptionInputAdapter";
import { prepareDemoTimeline, startDemoTimeline, stopDemoTimeline } from "@/lib/highwayAudioClock";
import { practiceSceneReadiness } from "@/lib/practiceSceneReadiness";
import { midiToNoteName } from "@/utils/noteSequenceUtils";
import type { MagentaNoteSequence } from "@/types/magenta";

// The student UI with local music only. Account/management hooks never mount here.
interface GuestAppProps { interactive?: boolean; onReady?: () => void }
export default function GuestApp({ interactive = true, onReady }: GuestAppProps) {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-center">Loading music…</p>;
  if (user) return <Navigate to="/" replace />;
  return <HighwayProvider fullKeyboard={false}><GuestWorkspace interactive={interactive} onReady={onReady} /></HighwayProvider>;
}

function GuestWorkspace({ interactive, onReady }: GuestAppProps) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!onReady || !root.current) return;
    const check = () => {
      if (!root.current?.querySelector("h1") || !root.current.querySelector("[data-piano-keys]")) return false;
      onReady();
      return true;
    };
    if (check()) return;
    const observer = new MutationObserver(() => { if (check()) observer.disconnect(); });
    observer.observe(root.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [onReady]);
  const [activeTune, setActiveTune] = useState<string | null>(null);
  const [signUpOpen, setSignUpOpen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeKeys, setActiveKeys] = useState(new Set<string>());
  const [micEnabled, setMicEnabled] = useState(false);
  const [pianoSoundType, setPianoSoundType] = useLocalStorage<PianoSoundType>(STORAGE_KEYS.INSTRUMENT, "acoustic-piano");
  const [displayNotes, setDisplayNotes] = useLocalStorage<DisplayNotesPreference>(STORAGE_KEYS.DISPLAY_NOTES, "auto");
  const [metronomeBpm, setMetronomeBpm] = useLocalStorage(STORAGE_KEYS.BPM, 120);
  const [metronomeTimeSignature, setMetronomeTimeSignature] = useLocalStorage(STORAGE_KEYS.TIME_SIGNATURE, "4/4");
  const [metronomeIsPlaying, setMetronomeIsPlaying] = useState(false);
  const [metronomeFeel, setMetronomeFeel] = useState<FeelPreset>("straight_beats");
  const [metronomeSoundType, setMetronomeSoundType] = useState<MetronomeSoundType>("classic");
  const showNoteRail = displayNotes === "always" || (displayNotes === "auto" && !!activeTune);
  const piano = useRef<PianoHandle>(null);
  const noteOn = useRef<((name: string) => void) | null>(null);
  const noteOff = useRef<((name: string) => void) | null>(null);
  const expectations = useRef<(() => { mids: number[]; t0: number; t1: number } | null) | null>(null);
  const generation = useRef(0);
  const playing = useRef(false);
  const inputKeys = useRef(new Map<string, number>());
  const silentMidi = useRef(false);
  const stop = useCallback(() => {
    generation.current++;
    playing.current = false;
    stopDemoTimeline(); piano.current?.stopPlayback();
    setIsPlaying(false); setActiveKeys(new Set());
  }, []);
  const releaseInputs = useCallback(() => {
    for (const [key, frequency] of inputKeys.current) piano.current?.handleKeyRelease(key, frequency);
    inputKeys.current.clear();
  }, []);
  const onNoteStart = useCallback((name: string, frequency: number) => {
    if (playing.current) stop();
    inputKeys.current.set(name, frequency);
    noteOn.current?.(name);
  }, [stop]);
  const onNoteEnd = useCallback((name: string) => { inputKeys.current.delete(name); noteOff.current?.(name); }, []);
  const midiOn = useCallback((name: string, frequency: number, velocity: number) => {
    if (!interactive || signUpOpen) return;
    piano.current?.handleKeyPress(name, frequency, velocity, { muteAudio: silentMidi.current, localOnly: true });
  }, [interactive, signUpOpen]);
  const midiOff = useCallback((name: string, frequency: number) => piano.current?.handleKeyRelease(name, frequency, { localOnly: true }), []);
  const midi = useMidiInput(midiOn, midiOff);
  const midiSound = useMidiSoundPreference(midi.connectedDevice);
  silentMidi.current = midiSound.silentWhilePlaying;
  const expectedNotes = useCallback(() => expectations.current?.() ?? null, []);
  const micOn = useCallback((name: string, frequency: number, velocity: number) => piano.current?.handleKeyPress(name, frequency, velocity, { muteAudio: true }), []);
  const micOff = useCallback((name: string, frequency: number) => piano.current?.handleKeyRelease(name, frequency, { muteAudio: true }), []);
  const mic = useMicTranscriptionInputAdapter({ enabled: micEnabled && !isPlaying, isGuided: !!activeTune,
    config: { acceptExpectedOnly: !!activeTune, pitchToleranceSemitones: 0 },
    expectedNotesProvider: expectedNotes, onNoteOn: micOn, onNoteOff: micOff });
  useEffect(() => {
    if (mic.error) { setMicEnabled(false); releaseInputs(); toast.error(mic.error); }
  }, [mic.error, releaseInputs]);
  useEffect(() => { if (midi.error) toast.error(midi.error); }, [midi.error]);
  useEffect(() => {
    const suspend = () => { stop(); releaseInputs(); setMicEnabled(false); };
    const visibility = () => { if (document.hidden) suspend(); };
    window.addEventListener("blur", suspend); document.addEventListener("visibilitychange", visibility);
    return () => { window.removeEventListener("blur", suspend); document.removeEventListener("visibilitychange", visibility); stop(); releaseInputs(); };
  }, [stop, releaseInputs]);
  const registerOn = useCallback((handler: ((name: string) => void) | null) => { noteOn.current = handler; }, []);
  const registerOff = useCallback((handler: ((name: string) => void) | null) => { noteOff.current = handler; }, []);
  const registerExpected = useCallback((provider: typeof expectations.current) => { expectations.current = provider; }, []);
  const play = useCallback(async (sequence: MagentaNoteSequence) => {
    stop(); releaseInputs(); setMicEnabled(false);
    const request = generation.current;
    try {
      // Resume in the Replay gesture; readiness wait must not lose user activation.
      await piano.current?.ensureAudioReady();
      await piano.current?.preload();
      if (request !== generation.current) return;
      prepareDemoTimeline(0);
      if (!await practiceSceneReadiness.wait(() => request !== generation.current)) return;
      if (request !== generation.current) return;
      const notes = (sequence.notes ?? []).map(note => ({ pitch: note.pitch, startTime: note.startTime ?? 0, endTime: note.endTime ?? 0 }));
      const total = Math.max(sequence.totalTime ?? 0, ...notes.map(note => note.endTime));
      playing.current = true; setIsPlaying(true);
      startDemoTimeline(notes, total, 0,
        (note, at) => piano.current?.playNote(440 * Math.pow(2, (note.pitch - 69) / 12), note.endTime - note.startTime, at),
        pitches => setActiveKeys(new Set([...pitches].map(midiToNoteName))), stop);
    } catch { stop(); toast.error("Piano playback couldn’t start. Please try Replay again."); }
  }, [stop, releaseInputs]);
  const leave = () => { stop(); releaseInputs(); setMicEnabled(false); setMetronomeIsPlaying(false); setActiveTune(null); };
  const openSignUp = () => {
    stop(); releaseInputs(); setMicEnabled(false); setMetronomeIsPlaying(false);
    setSignUpOpen(true);
  };

  return <div ref={root} data-highway-surface data-guest-workspace className="replay-workspace relative isolate h-dvh flex flex-col items-center justify-start bg-background overflow-hidden pt-(--safe-area-inset-top) pr-(--safe-area-inset-right) pl-(--safe-area-inset-left)">
    <div className="w-full flex-1 min-h-0 flex flex-col">
      <div className="replay-header sticky top-0 z-30 w-full">
        <div className="flex items-center justify-between gap-2 p-2">
          <div className="flex items-center gap-1">
            <Button asChild variant="ghost" size="icon">
              <Link to="/" aria-label="Back to home"><ArrowLeft className="size-5" aria-hidden="true" /></Link>
            </Button>
            <Link to="/" className="px-2 font-display text-2xl font-semibold tracking-tight">Noodlyn</Link>
          </div>
          <Button size="sm" onClick={event => { event.currentTarget.focus(); openSignUp(); }}>Sign up</Button>
        </div>
      </div>
      <div id="topContainer" className="w-full flex flex-col items-stretch justify-start relative flex-1 min-h-0 overflow-hidden">
        <div className="w-full h-full flex-1 min-h-0 flex items-start justify-center overflow-auto">
          {activeTune === "intro" ? <TuneMode tuneKey="intro" onLeave={leave} onPlaySample={play} onStopSample={stop}
            isPlayingSample={isPlaying} language="en" notationPreference="abc"
            onRegisterNoteHandler={registerOn} onRegisterNoteOffHandler={registerOff} onRegisterExpectedNotesProvider={registerExpected} />
            : <TuneLibrary onSignUp={openSignUp} previewPaused={signUpOpen} onSelectTune={key => { if (key === "intro") { stop(); releaseInputs(); setActiveTune(key); } }} />}
        </div>
      </div>
    </div>
    <PianoDock showNoteRail={showNoteRail} midiConnected={!!midi.connectedDevice} toolbar={
      <div className="keyboard-toolbar w-full flex flex-wrap items-center justify-between gap-2 p-1.5 shrink-0">
        <div className="flex items-center gap-1">
          <KeyboardSettings instrument={pianoSoundType}
            onInstrumentChange={value => { stop(); releaseInputs(); setPianoSoundType(value); }}
            displayNotes={displayNotes} onDisplayNotesChange={setDisplayNotes} />
          <Metronome bpm={metronomeBpm} setBpm={setMetronomeBpm}
            timeSignature={metronomeTimeSignature} setTimeSignature={setMetronomeTimeSignature}
            isPlaying={metronomeIsPlaying} setIsPlaying={setMetronomeIsPlaying}
            feel={metronomeFeel} onFeelChange={setMetronomeFeel}
            soundType={metronomeSoundType} onSoundTypeChange={setMetronomeSoundType} />
        </div>
        <PianoInput micEnabled={micEnabled} onMicEnabledChange={value => { stop(); releaseInputs(); setMicEnabled(value); }} micStatus={mic.status} micLevel={mic.level}
          isConnected={!!midi.connectedDevice} deviceName={midi.connectedDevice?.name ?? null} attemptedNoDevice={midi.attemptedNoDevice}
          isSupported={midi.isSupported} onConnect={() => void midi.requestAccess()} onDisconnect={midi.disconnect}
          silentWhilePlaying={midiSound.silentWhilePlaying} onSilentWhilePlayingChange={midiSound.setSilentWhilePlaying}
          playOnKeyboard={midiSound.playOnKeyboard} onPlayOnKeyboardChange={midiSound.setPlayOnKeyboard}
          canPlayOnKeyboard={midiSound.canPlayOnKeyboard} />
      </div>}>
      <div className="keyboard-panel w-full flex flex-col"><Piano ref={piano} className="flex-1 min-h-0" activeKeys={activeKeys}
        allowInput={interactive && !signUpOpen} soundType={pianoSoundType} language="en" notationPreference="abc" showNoteRail={showNoteRail}
        onNoteStart={onNoteStart} onNoteEnd={onNoteEnd} /></div>
    </PianoDock>
    <GuestSignUpDialog open={signUpOpen} onOpenChange={setSignUpOpen} />
  </div>;
}
