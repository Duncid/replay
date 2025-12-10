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
import { ChevronDown, Timer } from "lucide-react";
import { useToneMetronome, MetronomeSoundType } from "@/hooks/useToneMetronome";
import * as Tone from "tone";

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

const soundTypeLabels: Record<MetronomeSoundType, string> = {
  classic: "Classic Click",
  woodblock: "Woodblock",
  digital: "Digital Tick",
  hihat: "Hi-Hat",
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
const SCHEDULE_AHEAD_TIME = 0.1;
const LOOKAHEAD_INTERVAL = 25;

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

  const { soundType, setSoundType, playClick, ensureAudioReady } = useToneMetronome();

  const schedulerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextNoteTimeRef = useRef<number>(0);
  const currentScheduledBeatRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);

  const bpmRef = useRef(bpm);
  const timeSignatureRef = useRef(timeSignature);
  const volumeRef = useRef(volume);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    timeSignatureRef.current = timeSignature;
  }, [timeSignature]);

  useEffect(() => {
    volumeRef.current = volume;
    // Update Tone.js master volume
    Tone.getDestination().volume.value = Tone.gainToDb(volume / 100);
  }, [volume]);

  const scheduleBeat = useCallback((beatNumber: number, time: number) => {
    const isAccent = beatNumber === 0;
    playClick(isAccent, time);

    const delayMs = Math.max(0, (time - Tone.now()) * 1000);
    setTimeout(() => {
      if (isPlayingRef.current) {
        setCurrentBeat(beatNumber + 1);
      }
    }, delayMs);
  }, [playClick]);

  const scheduler = useCallback(() => {
    if (!isPlayingRef.current) return;

    const beats = beatsPerBar[timeSignatureRef.current];
    const secondsPerBeat = 60 / bpmRef.current;
    const currentTime = Tone.now();

    while (nextNoteTimeRef.current < currentTime + SCHEDULE_AHEAD_TIME) {
      scheduleBeat(currentScheduledBeatRef.current, nextNoteTimeRef.current);
      nextNoteTimeRef.current += secondsPerBeat;
      currentScheduledBeatRef.current = (currentScheduledBeatRef.current + 1) % beats;
    }
  }, [scheduleBeat]);

  const startMetronome = useCallback(async () => {
    await ensureAudioReady();
    
    isPlayingRef.current = true;
    nextNoteTimeRef.current = Tone.now();
    currentScheduledBeatRef.current = 0;

    scheduler();
    schedulerIntervalRef.current = setInterval(scheduler, LOOKAHEAD_INTERVAL);
  }, [ensureAudioReady, scheduler]);

  const stopMetronome = useCallback(() => {
    isPlayingRef.current = false;

    if (schedulerIntervalRef.current) {
      clearInterval(schedulerIntervalRef.current);
      schedulerIntervalRef.current = null;
    }
    setCurrentBeat(0);
  }, []);

  useEffect(() => {
    if (isPlaying) {
      startMetronome();
    } else {
      stopMetronome();
    }
    return () => stopMetronome();
  }, [isPlaying, startMetronome, stopMetronome]);

  useEffect(() => {
    if (isPlaying) {
      nextNoteTimeRef.current = Tone.now();
      currentScheduledBeatRef.current = 0;
    }
  }, [bpm, timeSignature, isPlaying]);

  const beats = beatsPerBar[timeSignature];

  return (
    <div className="py-2">
      <div className="flex items-center gap-6">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 px-3 gap-2">
              {bpm}, {timeSignature}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64 bg-popover">
            <DropdownMenuLabel>BPM: {bpm}</DropdownMenuLabel>
            <div className="px-2 pb-2">
              <Slider value={[bpm]} onValueChange={(value) => setBpm(value[0])} min={40} max={220} step={1} />
              <p className="text-xs text-muted-foreground mt-2">{getBpmDescription(bpm)}</p>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Time Signature: {timeSignature}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover">
                <DropdownMenuRadioGroup value={timeSignature} onValueChange={setTimeSignature}>
                  <DropdownMenuRadioItem value="2/4">2/4</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="3/4">3/4</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="4/4">4/4</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="6/8">6/8</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Sound: {soundTypeLabels[soundType]}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover">
                <DropdownMenuRadioGroup value={soundType} onValueChange={(v) => setSoundType(v as MetronomeSoundType)}>
                  <DropdownMenuRadioItem value="classic">Classic Click</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="woodblock">Woodblock</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="digital">Digital Tick</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="hihat">Hi-Hat</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex items-center gap-3">
          <Label htmlFor="metronome-toggle" className="text-foreground cursor-pointer flex items-center gap-1.5">
            <Timer className="h-4 w-4" />
          </Label>
          <Switch checked={isPlaying} onCheckedChange={setIsPlaying} id="metronome-toggle" />
        </div>

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

        {isPlaying && (
          <div className="flex items-center gap-2">
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

        {children && <div>{children}</div>}
      </div>
    </div>
  );
};
