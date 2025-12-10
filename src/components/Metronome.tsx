import { useState, useRef, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

const beatsPerBar: Record<string, number> = {
  "2/4": 2,
  "3/4": 3,
  "4/4": 4,
  "6/8": 6,
};

const getBpmDescription = (bpm: number): string => {
  if (bpm <= 50) return "🐢 Largo — Very slow and meditative.";
  if (bpm <= 60) return "🕯️ Adagio — Slow and expressive.";
  if (bpm <= 72) return "🚶 Andante — Walking pace.";
  if (bpm <= 90) return "🌿 Moderato — Moderate and natural.";
  if (bpm <= 110) return "🎵 Groove tempo — Common pop & R&B.";
  if (bpm <= 130) return "⚡ Upbeat — Energetic and driving.";
  if (bpm <= 160) return "🔥 Fast — Intense and lively.";
  if (bpm <= 200) return "🚀 Very fast — For advanced players.";
  return "🧠 Extreme — Ultra-fast or double-time feel.";
};

export interface MetronomeSettings {
  bpm: number;
  timeSignature: string;
  isPlaying: boolean;
}

interface MetronomeProps {
  bpm: number;
  setBpm: (bpm: number) => void;
  timeSignature: string;
  setTimeSignature: (ts: string) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  children?: React.ReactNode;
}

// Lookahead scheduling constants
const SCHEDULE_AHEAD_TIME = 0.1; // seconds to look ahead for scheduling
const LOOKAHEAD_INTERVAL = 25; // ms between scheduler checks

export const Metronome = ({
  bpm,
  setBpm,
  timeSignature,
  setTimeSignature,
  isPlaying,
  setIsPlaying,
  children,
}: MetronomeProps) => {
  const [volume, setVolume] = useState(50);
  const [currentBeat, setCurrentBeat] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const schedulerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const currentScheduledBeatRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);

  // Use refs to access latest values in scheduler without re-creating it
  const bpmRef = useRef(bpm);
  const timeSignatureRef = useRef(timeSignature);
  const volumeRef = useRef(volume);

  // Keep refs in sync
  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    timeSignatureRef.current = timeSignature;
  }, [timeSignature]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  // Schedule a click at a precise time using Web Audio API
  const scheduleClick = useCallback((audioContext: AudioContext, time: number, isAccent: boolean) => {
    const volumeMultiplier = volumeRef.current / 100;
    const clickDuration = 0.015;

    // Main click oscillator
    const oscillator = audioContext.createOscillator();
    const oscGain = audioContext.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.value = isAccent ? 2400 : 1800;

    oscillator.connect(oscGain);
    oscGain.connect(audioContext.destination);

    const baseGain = isAccent ? 0.12 : 0.08;
    oscGain.gain.setValueAtTime(baseGain * volumeMultiplier, time);
    oscGain.gain.exponentialRampToValueAtTime(0.001, time + clickDuration);

    oscillator.start(time);
    oscillator.stop(time + clickDuration);

    // Add subtle high-frequency "tick" layer
    const tickOsc = audioContext.createOscillator();
    const tickGain = audioContext.createGain();
    const tickFilter = audioContext.createBiquadFilter();

    tickOsc.type = "square";
    tickOsc.frequency.value = isAccent ? 4000 : 3200;

    tickFilter.type = "highpass";
    tickFilter.frequency.value = 2000;
    tickFilter.Q.value = 1;

    tickOsc.connect(tickFilter);
    tickFilter.connect(tickGain);
    tickGain.connect(audioContext.destination);

    const tickBaseGain = isAccent ? 0.04 : 0.025;
    tickGain.gain.setValueAtTime(tickBaseGain * volumeMultiplier, time);
    tickGain.gain.exponentialRampToValueAtTime(0.001, time + 0.008);

    tickOsc.start(time);
    tickOsc.stop(time + 0.01);
  }, []);

  // Schedule a beat (audio + visual update)
  const scheduleBeat = useCallback((audioContext: AudioContext, beatNumber: number, time: number) => {
    const beats = beatsPerBar[timeSignatureRef.current];
    const isAccent = beatNumber === 0;
    
    // Schedule precise audio
    scheduleClick(audioContext, time, isAccent);
    
    // Schedule visual update (approximate, synced to audio time)
    const delayMs = Math.max(0, (time - audioContext.currentTime) * 1000);
    setTimeout(() => {
      if (isPlayingRef.current) {
        setCurrentBeat(beatNumber + 1);
      }
    }, delayMs);
  }, [scheduleClick]);

  // Main scheduler function - runs frequently to fill the scheduling buffer
  const scheduler = useCallback(() => {
    const audioContext = audioContextRef.current;
    if (!audioContext || !isPlayingRef.current) return;

    const beats = beatsPerBar[timeSignatureRef.current];
    const secondsPerBeat = 60 / bpmRef.current;

    // Schedule all beats that fall within our lookahead window
    while (nextNoteTimeRef.current < audioContext.currentTime + SCHEDULE_AHEAD_TIME) {
      scheduleBeat(audioContext, currentScheduledBeatRef.current, nextNoteTimeRef.current);
      
      // Advance to next beat
      nextNoteTimeRef.current += secondsPerBeat;
      currentScheduledBeatRef.current = (currentScheduledBeatRef.current + 1) % beats;
    }
  }, [scheduleBeat]);

  const startMetronome = useCallback(() => {
    const audioContext = ensureAudioContext();
    if (!audioContext) return;

    isPlayingRef.current = true;
    
    // Initialize timing - start scheduling from now
    nextNoteTimeRef.current = audioContext.currentTime;
    currentScheduledBeatRef.current = 0;
    
    // Start the scheduler loop
    scheduler(); // Run immediately to schedule first beats
    schedulerIntervalRef.current = setInterval(scheduler, LOOKAHEAD_INTERVAL);
  }, [ensureAudioContext, scheduler]);

  const stopMetronome = useCallback(() => {
    isPlayingRef.current = false;
    
    if (schedulerIntervalRef.current) {
      clearInterval(schedulerIntervalRef.current);
      schedulerIntervalRef.current = null;
    }
    setCurrentBeat(0);
  }, []);

  // Handle play/stop
  useEffect(() => {
    if (isPlaying) {
      startMetronome();
    } else {
      stopMetronome();
    }
    return () => stopMetronome();
  }, [isPlaying, startMetronome, stopMetronome]);

  // Handle BPM or time signature changes while playing
  useEffect(() => {
    if (isPlaying && audioContextRef.current) {
      // Reset scheduling to apply new tempo immediately
      // Keep the current beat position but recalculate timing
      const audioContext = audioContextRef.current;
      nextNoteTimeRef.current = audioContext.currentTime;
      currentScheduledBeatRef.current = 0;
    }
  }, [bpm, timeSignature, isPlaying]);

  const beats = beatsPerBar[timeSignature];

  return (
    <div className="w-full py-2">
      <div className="flex items-center justify-between gap-6">
        {/* Left: Settings dropdown, Metronome switch, and Volume */}
        <div className="flex items-center gap-6">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-3 gap-2">
                {bpm}, {timeSignature}
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {/* BPM Control */}
              <DropdownMenuLabel>BPM: {bpm}</DropdownMenuLabel>
              <div className="px-2 pb-2">
                <Slider value={[bpm]} onValueChange={(value) => setBpm(value[0])} min={40} max={220} step={1} />
                <p className="text-xs text-muted-foreground mt-2">{getBpmDescription(bpm)}</p>
              </div>

              <DropdownMenuSeparator />

              {/* Time Signature Submenu */}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>Time Signature: {timeSignature}</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuRadioGroup value={timeSignature} onValueChange={setTimeSignature}>
                    <DropdownMenuRadioItem value="2/4">2/4</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="3/4">3/4</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="4/4">4/4</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="6/8">6/8</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex items-center gap-3">
            <Label htmlFor="metronome-toggle" className="text-foreground cursor-pointer">
              Metronome
            </Label>
            <Switch checked={isPlaying} onCheckedChange={setIsPlaying} id="metronome-toggle" />
          </div>

          {/* Volume slider - only visible when metronome is on */}
          {isPlaying && (
            <div className="flex items-center gap-2">
              <Slider
                value={[volume]}
                onValueChange={(value) => setVolume(value[0])}
                min={0}
                max={100}
                step={1}
                className="w-20"
              />
            </div>
          )}
        </div>

        {/* Center: Beat Indicators (only when playing) */}
        {isPlaying && (
          <div className="flex items-center gap-2 ">
            {Array.from({ length: beats }, (_, i) => {
              const beatNumber = i + 1;
              const isActive = currentBeat === beatNumber;
              const isFirstBeat = beatNumber === 1;

              return (
                <div
                  key={i}
                  className={`
                    rounded-full transition-all duration-100
                    ${isFirstBeat ? "w-3.5 h-3.5" : "w-2.5 h-2.5"}
                    ${
                      isActive
                        ? `bg-foreground ${isFirstBeat ? "ring-2 ring-foreground/50 scale-125" : "scale-110"}`
                        : "bg-muted"
                    }
                  `}
                />
              );
            })}
          </div>
        )}

        {/* Right: Children (MIDI Connector) */}
        {children && <div className="ml-auto">{children}</div>}
      </div>
    </div>
  );
};
