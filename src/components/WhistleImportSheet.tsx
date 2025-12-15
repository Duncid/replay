import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent } from "@/components/ui/card";
import { SheetMusic } from "@/components/SheetMusic";
import { NoteSequence } from "@/types/noteSequence";
import { createEmptyNoteSequence } from "@/utils/noteSequenceUtils";
import { midiToNoteName } from "@/utils/noteSequenceUtils";
import { AlertCircle, Mic, RefreshCw, Square, Waveform } from "lucide-react";

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

function detectPitch(buffer: Float32Array, sampleRate: number): PitchDetectionResult {
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

  const period = (maxIndex + offset) || maxIndex;
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

  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  ctx.lineWidth = 2;
  ctx.strokeStyle = "hsl(var(--primary))";
  ctx.beginPath();

  const sliceWidth = width / buffer.length;
  let x = 0;

  for (let i = 0; i < buffer.length; i++) {
    const v = buffer[i] * 0.5 + 0.5;
    const y = v * height;

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
  const [isRecording, setIsRecording] = useState(false);
  const [notes, setNotes] = useState<NoteSequence["notes"]>([]);
  const [error, setError] = useState<string | null>(null);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [livePitch, setLivePitch] = useState<number | null>(null);
  const [liveRms, setLiveRms] = useState<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const recordingStartRef = useRef<number>(0);
  const waveformCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastLiveUpdateRef = useRef<number>(0);

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
    seq.totalTime = notes.length ? Math.max(...notes.map(n => n.endTime)) : 0;
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
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
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
    const duration = endTime - currentNoteRef.current.startTime;
    if (duration >= MIN_DURATION) {
      setNotes(prev => [
        ...prev,
        {
          pitch: Math.round(currentNoteRef.current!.pitch),
          startTime: currentNoteRef.current!.startTime,
          endTime,
          velocity: currentNoteRef.current!.velocity,
        },
      ]);
    }
    currentNoteRef.current = null;
  }, []);

  const processAudio = useCallback(() => {
    if (!isRecording || !analyserRef.current || !audioContextRef.current) return;

    const analyser = analyserRef.current;
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);

    if (waveformCanvasRef.current) {
      drawWaveform(waveformCanvasRef.current, buffer);
    }

    const { frequency, confidence, rms } = detectPitch(buffer, audioContextRef.current.sampleRate);
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
        if (Math.abs(pitch - currentNoteRef.current.pitch) >= 1 && voicedStreakRef.current >= STABILITY_FRAMES) {
          finalizeCurrentNote(now);
          currentNoteRef.current = {
            pitch,
            startTime: now,
            lastTime: now,
            velocity,
          };
        } else {
          currentNoteRef.current.lastTime = now;
          currentNoteRef.current.velocity = (currentNoteRef.current.velocity + velocity) / 2;
        }
      }
    } else {
      unvoicedStreakRef.current += 1;
      voicedStreakRef.current = 0;

      if (nowMillis - lastLiveUpdateRef.current > 50) {
        setLivePitch(null);
        setLiveRms(rms);
        lastLiveUpdateRef.current = nowMillis;
      }

      if (currentNoteRef.current && unvoicedStreakRef.current >= RELEASE_FRAMES) {
        finalizeCurrentNote(now);
      }
    }

    rafRef.current = requestAnimationFrame(processAudio);
  }, [finalizeCurrentNote, isRecording]);

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      setPermissionDenied(false);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);

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

      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      mediaStreamRef.current = stream;
      recordingStartRef.current = audioContext.currentTime;
      setNotes([]);
      setLivePitch(null);
      setLiveRms(0);
      setIsRecording(true);
      rafRef.current = requestAnimationFrame(processAudio);
    } catch (err) {
      console.error("Microphone error", err);
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        setPermissionDenied(true);
        setError("Microphone access was denied. Please allow microphone permissions and try again.");
      } else {
        setError("Unable to access microphone. Please check your device and try again.");
      }
      cleanupAudio();
    }
  }, [cleanupAudio, processAudio]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    if (audioContextRef.current) {
      const now = audioContextRef.current.currentTime - recordingStartRef.current;
      finalizeCurrentNote(now);
    }
    cleanupAudio();
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
  }, []);

  useEffect(() => {
    if (!open) {
      stopRecording();
      handleClear();
    }
    return () => {
      stopRecording();
    };
  }, [open, stopRecording, handleClear]);

  const hasRecording = notes.length > 0;
  const liveNoteLabel = livePitch !== null ? midiToNoteName(Math.round(livePitch)) : "--";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Mic className="h-5 w-5" />
            Whistle Import
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

          <Card>
            <CardContent className="py-4 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Button
                  onClick={isRecording ? stopRecording : startRecording}
                  className="gap-2"
                  variant={isRecording ? "destructive" : "default"}
                >
                  {isRecording ? <Square className="h-4 w-4" fill="currentColor" /> : <Mic className="h-4 w-4" />}
                  {isRecording ? "Stop" : "Rec"}
                </Button>
                <Button variant="outline" onClick={handleClear} disabled={!hasRecording && !isRecording} className="gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Clear
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Whistle one note at a time into your microphone. We track the pitch and duration to build a NoteSequence you can
                add to your composition.
              </p>
              {permissionDenied && (
                <p className="text-xs text-muted-foreground">
                  Tip: check your browser permission prompt or settings to enable microphone access.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Waveform className="h-4 w-4" /> Live pitch & signal
              </div>
              <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide">Note</span>
                  <span className="text-lg font-semibold text-foreground">{liveNoteLabel}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs uppercase tracking-wide">Level</span>
                  <div className="h-2 w-24 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${Math.min(1, liveRms * 12) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
              <div className="border rounded-md bg-muted/40">
                <canvas ref={waveformCanvasRef} width={640} height={120} className="w-full h-24" />
              </div>
              <p className="text-xs text-muted-foreground">
                Start recording to see the incoming whistle signal and the detected note name update in real time.
              </p>
            </CardContent>
          </Card>

          {hasRecording ? (
            <div className="space-y-2 flex-shrink-0">
              <div className="text-sm font-medium">Detected notes</div>
              <div className="overflow-x-auto flex-1">
                <SheetMusic sequence={sequence} compact noControls noTitle />
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No notes captured yet. Press Rec and start whistling to begin.</div>
          )}
        </div>

        <SheetFooter className="gap-2 flex-shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!hasRecording}>
            Save
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
