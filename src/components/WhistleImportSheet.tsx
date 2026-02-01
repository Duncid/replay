import { SheetMusic } from "@/components/SheetMusic";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { usePianoAudio } from "@/hooks/usePianoAudio";
import { NoteSequence } from "@/types/noteSequence";
import {
  createEmptyNoteSequence,
  midiToFrequency,
  midiToSolfege,
  pitchToAbcNote,
} from "@/utils/noteSequenceUtils";
import { AlertCircle, Mic, Play, Square, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface WhistleImportSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (sequence: NoteSequence) => void;
  bpm: number;
  timeSignature: string;
}

interface PitchDetectionResult {
  frequency: number | null;
  confidence: number;
  rms: number;
}

const MIN_CONFIDENCE = 0.8;
const MIN_RMS = 0.01;
const MIN_DURATION = 0.1; // seconds
const STABILITY_FRAMES = 3;
const RELEASE_FRAMES = 6;

function hzToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

function formatNoteWithSolfegeAndAbc(pitch: number, language: string): string {
  const solfege = midiToSolfege(pitch);
  if (language === "fr") {
    return solfege;
  }
  const abc = pitchToAbcNote(pitch);
  return `${solfege} (${abc})`;
}

function detectPitch(
  buffer: Float32Array,
  sampleRate: number,
): PitchDetectionResult {
  let size = buffer.length;
  let rms = 0;
  for (let i = 0; i < size; i++) {
    const val = buffer[i];
    rms += val * val;
  }
  rms = Math.sqrt(rms / size);

  if (rms < MIN_RMS) {
    return { frequency: null, confidence: 0, rms };
  }

  let r1 = 0;
  let r2 = size - 1;
  const threshold = 0.2;
  while (r1 < size && Math.abs(buffer[r1]) < threshold) r1++;
  while (r2 > r1 && Math.abs(buffer[r2]) < threshold) r2--;

  const trimmed = buffer.slice(r1, r2);
  size = trimmed.length;

  const correlations = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    let correlation = 0;
    for (let j = 0; j < size - i; j++) {
      correlation += trimmed[j] * trimmed[j + i];
    }
    correlations[i] = correlation;
  }

  let d = 0;
  while (d < size - 1 && correlations[d] > correlations[d + 1]) {
    d++;
  }

  let maxValue = -1;
  let maxIndex = -1;
  for (let i = d; i < size; i++) {
    if (correlations[i] > maxValue) {
      maxValue = correlations[i];
      maxIndex = i;
    }
  }

  if (maxIndex <= 0) {
    return { frequency: null, confidence: 0, rms };
  }

  const prev = correlations[maxIndex - 1] ?? correlations[maxIndex];
  const next = correlations[maxIndex + 1] ?? correlations[maxIndex];
  const delta = next - prev;
  const denominator = 2 * (2 * correlations[maxIndex] - prev - next);
  const offset = denominator === 0 ? 0 : delta / denominator;

  const period = maxIndex + offset || maxIndex;
  const frequency = sampleRate / period;
  const confidence = maxValue / correlations[0];

  return { frequency, confidence, rms };
}

function velocityFromRms(rms: number) {
  return Math.min(1, Math.max(0.2, rms * 8));
}

function drawWaveform(canvas: HTMLCanvasElement, buffer: Float32Array) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Get the actual display size
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;

  // Set internal canvas size accounting for device pixel ratio
  const displayWidth = rect.width;
  const displayHeight = rect.height;
  const internalWidth = displayWidth * dpr;
  const internalHeight = displayHeight * dpr;

  // Only resize if dimensions have changed
  if (canvas.width !== internalWidth || canvas.height !== internalHeight) {
    canvas.width = internalWidth;
    canvas.height = internalHeight;
    ctx.scale(dpr, dpr);
  }

  // Clear with display dimensions
  ctx.clearRect(0, 0, displayWidth, displayHeight);

  // Get accent color from computed styles (CSS variables don't work directly in canvas)
  const computedStyle = getComputedStyle(canvas);
  const accentColor = computedStyle.getPropertyValue("--accent").trim();
  const strokeColor = accentColor ? `hsl(${accentColor})` : "hsl(45, 95%, 60%)"; // Fallback to accent default

  ctx.lineWidth = 2;
  ctx.strokeStyle = strokeColor;
  ctx.beginPath();

  const sliceWidth = displayWidth / buffer.length;
  let x = 0;

  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] * 0.5 + 0.5;
    const y = v * displayHeight;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }

    x += sliceWidth;
  }

  ctx.stroke();
}

export function WhistleImportSheet({
  open,
  onOpenChange,
  onSave,
  bpm,
  timeSignature,
}: WhistleImportSheetProps) {
  const { t, i18n } = useTranslation();
  const [isRecording, setIsRecording] = useState(false);
  const [notes, setNotes] = useState<NoteSequence["notes"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [livePitch, setLivePitch] = useState<number | null>(null);
  const [liveRms, setLiveRms] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Audio engine for playback (only create when sheet is open)
  const audio = usePianoAudio(open ? "classic" : null);
  const { ensureAudioReady, playNote } = audio;
  const playbackRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number>(0);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastLiveUpdateRef = useRef<number>(0);
  const isRecordingRef = useRef<boolean>(false);

  const currentNoteRef = useRef<{
    pitch: number;
    startTime: number;
    lastTime: number;
    velocity: number;
  } | null>(null);
  const voicedStreakRef = useRef(0);
  const unvoicedStreakRef = useRef(0);

  const sequence = useMemo(() => {
    const seq = createEmptyNoteSequence(bpm, timeSignature);
    seq.notes = notes;
    seq.totalTime = notes.length ? Math.max(...notes.map((n) => n.endTime)) : 0;
    return seq;
  }, [notes, bpm, timeSignature]);

  const cleanupAudio = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (analyserRef.current) {
      analyserRef.current.disconnect();
      analyserRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    currentNoteRef.current = null;
    voicedStreakRef.current = 0;
    unvoicedStreakRef.current = 0;
    setLivePitch(null);
    setLiveRms(0);
  }, []);

  const finalizeCurrentNote = useCallback((endTime: number) => {
    if (!currentNoteRef.current) return;
    const currentNote = currentNoteRef.current;
    const duration = endTime - currentNote.startTime;
    if (duration >= MIN_DURATION) {
      setNotes((prev) => [
        ...prev,
        {
          pitch: Math.round(currentNote.pitch),
          startTime: currentNote.startTime,
          endTime,
          velocity: currentNote.velocity,
        },
      ]);
    }
    currentNoteRef.current = null;
  }, []);

  const processAudio = useCallback(() => {
    if (
      !isRecordingRef.current ||
      !analyserRef.current ||
      !audioContextRef.current
    )
      return;

    // Ensure AudioContext is running
    if (audioContextRef.current.state !== "running") {
      audioContextRef.current.resume().catch(console.error);
      rafRef.current = requestAnimationFrame(processAudio);
      return;
    }

    const analyser = analyserRef.current;
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    // Debug logging (temporary)
    const bufferRms = Math.sqrt(
      buffer.reduce((sum, val) => sum + val * val, 0) / buffer.length,
    );
    if (bufferRms > 0.001) {
      console.debug(
        "Audio buffer RMS:",
        bufferRms.toFixed(4),
        "Max:",
        Math.max(...Array.from(buffer.map(Math.abs))).toFixed(4),
      );
    }

    if (waveformCanvasRef.current) {
      drawWaveform(waveformCanvasRef.current, buffer);
    }

    const { frequency, confidence, rms } = detectPitch(
      buffer,
      audioContextRef.current.sampleRate,
    );
    const now = audioContextRef.current.currentTime - recordingStartRef.current;

    const isVoiced =
      !!frequency &&
      confidence >= MIN_CONFIDENCE &&
      rms >= MIN_RMS &&
      frequency > 500 &&
      frequency < 5000;

    const nowMillis = performance.now();
    if (isVoiced) {
      voicedStreakRef.current += 1;
      unvoicedStreakRef.current = 0;
      const pitch = hzToMidi(frequency!);
      const velocity = velocityFromRms(rms);

      if (nowMillis - lastLiveUpdateRef.current > 50) {
        setLivePitch(pitch);
        setLiveRms(rms);
        lastLiveUpdateRef.current = nowMillis;
      }

      if (!currentNoteRef.current) {
        if (voicedStreakRef.current >= STABILITY_FRAMES) {
          currentNoteRef.current = {
            pitch,
            startTime: now,
            lastTime: now,
            velocity,
          };
        }
      } else {
        if (
          Math.abs(pitch - currentNoteRef.current.pitch) >= 1 &&
          voicedStreakRef.current >= STABILITY_FRAMES
        ) {
          finalizeCurrentNote(now);
          currentNoteRef.current = {
            pitch,
            startTime: now,
            lastTime: now,
            velocity,
          };
        } else {
          currentNoteRef.current.lastTime = now;
          currentNoteRef.current.velocity =
            (currentNoteRef.current.velocity + velocity) / 2;
        }
      }
    } else {
      unvoicedStreakRef.current += 1;
      voicedStreakRef.current = 0;

      if (nowMillis - lastLiveUpdateRef.current > 50) {
        // Keep the last detected note visible, only update RMS level
        setLiveRms(rms);
        lastLiveUpdateRef.current = nowMillis;
      }

      if (
        currentNoteRef.current &&
        unvoicedStreakRef.current >= RELEASE_FRAMES
      ) {
        finalizeCurrentNote(now);
      }
    }

    rafRef.current = requestAnimationFrame(processAudio);
  }, [finalizeCurrentNote]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setPermissionDenied(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log(
        "Microphone stream obtained:",
        stream.getAudioTracks().length,
        "audio track(s)",
      );

      const audioContext = new AudioContext();
      console.log("AudioContext created, state:", audioContext.state);

      // Ensure AudioContext is running (resume if suspended)
      if (audioContext.state === "suspended") {
        await audioContext.resume();
        console.log("AudioContext resumed, new state:", audioContext.state);
      }

      // Wait a bit to ensure AudioContext is fully ready
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify AudioContext is running
      if (audioContext.state !== "running") {
        throw new Error(
          `AudioContext failed to start. State: ${audioContext.state}`,
        );
      }

      const source = audioContext.createMediaStreamSource(stream);
      console.log("MediaStreamSource created");

      const highpass = audioContext.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = 700;

      const lowpass = audioContext.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.value = 6000;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0;

      source.connect(highpass).connect(lowpass).connect(analyser);
      console.log(
        "Audio graph connected: source -> highpass -> lowpass -> analyser",
      );

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      mediaStreamRef.current = stream;
      recordingStartRef.current = audioContext.currentTime;
      setNotes([]);
      setLivePitch(null);
      setLiveRms(0);
      isRecordingRef.current = true;
      setIsRecording(true);

      // Start processing after a brief delay to ensure everything is ready
      setTimeout(() => {
        if (
          isRecordingRef.current &&
          analyserRef.current &&
          audioContextRef.current &&
          audioContextRef.current.state === "running"
        ) {
          rafRef.current = requestAnimationFrame(processAudio);
        }
      }, 100);
    } catch (err) {
      console.error("Microphone error", err);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setPermissionDenied(true);
        setError(t("whistleImport.errors.permissionDenied"));
      } else {
        const errorMessage =
          err instanceof Error
            ? err.message
            : t("whistleImport.errors.unknown");
        setError(
          t("whistleImport.errors.accessFailed", { error: errorMessage }),
        );
      }
      cleanupAudio();
    }
  }, [cleanupAudio, processAudio, t]);

  const stopRecording = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    if (audioContextRef.current) {
      const now =
        audioContextRef.current.currentTime - recordingStartRef.current;
      finalizeCurrentNote(now);
    }
    cleanupAudio();
    // Stop playback if playing
    playbackRef.current.cancelled = true;
    setIsPlaying(false);
  }, [cleanupAudio, finalizeCurrentNote]);

  const handleSave = useCallback(() => {
    if (notes.length === 0) return;
    onSave(sequence);
    onOpenChange(false);
    setNotes([]);
  }, [notes.length, onOpenChange, onSave, sequence]);

  const handleClear = useCallback(() => {
    setNotes([]);
    currentNoteRef.current = null;
    voicedStreakRef.current = 0;
    unvoicedStreakRef.current = 0;
    setLivePitch(null);
    setLiveRms(0);
    // Stop playback if playing
    playbackRef.current.cancelled = true;
    setIsPlaying(false);
  }, []);

  const handlePlay = useCallback(async () => {
    if (!sequence || sequence.notes.length === 0) return;

    await ensureAudioReady();
    setIsPlaying(true);
    playbackRef.current = { cancelled: false };

    const sortedNotes = [...sequence.notes].sort(
      (a, b) => a.startTime - b.startTime,
    );
    const startTime = performance.now();

    for (const note of sortedNotes) {
      if (playbackRef.current.cancelled) break;

      const noteStartMs = note.startTime * 1000;
      const elapsed = performance.now() - startTime;
      const delay = noteStartMs - elapsed;

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      if (playbackRef.current.cancelled) break;

      const frequency = midiToFrequency(note.pitch);
      const duration = note.endTime - note.startTime;
      await playNote(frequency, duration);
    }

    // Wait for last note to finish
    const lastNote = sortedNotes[sortedNotes.length - 1];
    if (lastNote && !playbackRef.current.cancelled) {
      const lastNoteDuration = (lastNote.endTime - lastNote.startTime) * 1000;
      await new Promise((resolve) => setTimeout(resolve, lastNoteDuration));
    }

    setIsPlaying(false);
  }, [sequence, ensureAudioReady, playNote]);

  const handleStop = useCallback(() => {
    playbackRef.current.cancelled = true;
    setIsPlaying(false);
  }, []);

  // Initialize canvas dimensions when component mounts or opens
  useEffect(() => {
    if (open && waveformCanvasRef.current) {
      const canvas = waveformCanvasRef.current;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(dpr, dpr);
      }
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      stopRecording();
      handleClear();
      // Stop playback when sheet closes
      playbackRef.current.cancelled = true;
      setIsPlaying(false);
    }
    return () => {
      stopRecording();
      // Stop playback on unmount
      playbackRef.current.cancelled = true;
      setIsPlaying(false);
    };
  }, [open, stopRecording, handleClear]);

  const hasRecording = notes.length > 0;
  const liveNoteLabel =
    livePitch !== null
      ? formatNoteWithSolfegeAndAbc(Math.round(livePitch), i18n.language)
      : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            {t("whistleImport.title")}
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 flex flex-col space-y-4 py-4 overflow-y-auto min-h-0">
          {error && (
            <Card className="border-destructive/40 bg-destructive/5">
              <CardContent className="py-3 text-sm text-destructive flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5" />
                <span>{error}</span>
              </CardContent>
            </Card>
          )}
          <div className="flex flex-col h-full items-center w-full justify-center gap-6">
            {permissionDenied && (
              <p className="text-xs text-muted-foreground">
                {t("whistleImport.permissionTip")}
              </p>
            )}

            <div
              id="noteIndicator"
              className="relative flex items-center justify-center w-32 h-32 rounded-full bg-muted/20"
            >
              <span className="text-2xl font-semibold text-foreground z-10">
                {liveNoteLabel}
              </span>
              {/* Ring that varies with RMS level */}
              <div
                className="absolute inset-0 rounded-full border-2 border-accent transition-all duration-75"
                style={{
                  borderWidth: `${2 + Math.min(1, liveRms * 12) * 6}px`,
                  opacity: Math.min(1, liveRms * 12),
                }}
              />
            </div>
            <Button
              onClick={isRecording ? stopRecording : startRecording}
              className="gap-2"
              variant={isRecording ? "destructive" : "default"}
            >
              {isRecording ? (
                <Square className="h-4 w-4" fill="currentColor" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              {isRecording
                ? t("whistleImport.buttons.stop")
                : t("whistleImport.buttons.rec")}
            </Button>
            <canvas ref={waveformCanvasRef} className="w-full h-24" />
          </div>

          <div className="space-y-2 flex-shrink-0 min-h-36">
            {hasRecording && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-medium">
                    {t("whistleImport.detectedNotes")}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    {isPlaying ? (
                      <Button variant="outline" onClick={handleStop}>
                        <Square fill="currentColor" />
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        onClick={handlePlay}
                        disabled={!hasRecording || sequence.notes.length === 0}
                      >
                        <Play fill="currentColor" />
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      onClick={handleClear}
                      disabled={!hasRecording && !isRecording}
                      className="gap-2"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto flex-1">
                  <SheetMusic sequence={sequence} compact noControls noTitle />
                </div>
              </>
            )}
          </div>
        </div>

        <SheetFooter className="gap-2 flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("menus.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!hasRecording}>
            {t("menus.save")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
