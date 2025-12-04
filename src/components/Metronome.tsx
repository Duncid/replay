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
import { Settings, Volume2, ChevronDown } from "lucide-react";

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
}

export const Metronome = ({
  bpm,
  setBpm,
  timeSignature,
  setTimeSignature,
  isPlaying,
  setIsPlaying,
}: MetronomeProps) => {
  const [volume, setVolume] = useState(50);
  const [currentBeat, setCurrentBeat] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playClick = useCallback(
    (isAccent: boolean) => {
      const audioContext = ensureAudioContext();
      if (!audioContext) return;

      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = isAccent ? 1000 : 800;
      oscillator.type = "sine";

      const volumeMultiplier = volume / 100;
      const baseGain = isAccent ? 0.5 : 0.3;
      const now = audioContext.currentTime;
      gainNode.gain.setValueAtTime(baseGain * volumeMultiplier, now);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

      oscillator.start(now);
      oscillator.stop(now + 0.05);
    },
    [ensureAudioContext, volume],
  );

  const startMetronome = useCallback(() => {
    const beats = beatsPerBar[timeSignature];
    let beat = 0;

    setCurrentBeat(1);
    playClick(true);

    const interval = 60000 / bpm;
    intervalRef.current = setInterval(() => {
      beat = (beat + 1) % beats;
      const currentBeatNumber = beat + 1;
      setCurrentBeat(currentBeatNumber);
      playClick(beat === 0);
    }, interval);
  }, [bpm, timeSignature, playClick]);

  const stopMetronome = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
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
      stopMetronome();
      startMetronome();
    }
  }, [bpm, timeSignature]);

  const beats = beatsPerBar[timeSignature];

  return (
    <div className="w-full px-4 py-3 bg-card rounded-lg border border-border">
      <div className="flex items-center justify-between gap-4">
        {/* Left: Switch, Label, and Settings */}
        <div className="flex items-center gap-3">
          <Switch checked={isPlaying} onCheckedChange={setIsPlaying} id="metronome-toggle" />
          <Label htmlFor="metronome-toggle" className="text-foreground cursor-pointer">
            Metronome
          </Label>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 px-3 gap-2">
                <Settings className="w-4 h-4" />
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

              {/* Volume Control */}
              <DropdownMenuLabel className="flex items-center gap-2">
                <Volume2 className="w-4 h-4" />
                Volume
              </DropdownMenuLabel>
              <div className="px-2 pb-2">
                <Slider value={[volume]} onValueChange={(value) => setVolume(value[0])} min={0} max={100} step={1} />
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
        </div>

        {/* Right: Beat Indicators (only when playing) */}
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
                    ${isFirstBeat ? "w-4 h-4" : "w-3 h-3"}
                    ${
                      isActive
                        ? `bg-foreground ${isFirstBeat ? "ring-2 ring-foreground/50 scale-125" : "scale-110"}`
                        : "bg-muted border border-muted-foreground/30"
                    }
                  `}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
