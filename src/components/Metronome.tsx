import { useState, useRef, useEffect, useCallback } from "react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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

export const Metronome = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [bpm, setBpm] = useState(120);
  const [timeSignature, setTimeSignature] = useState("4/4");
  const [currentBeat, setCurrentBeat] = useState(0);
  
  const audioContextRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize AudioContext on first interaction
  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    return audioContextRef.current;
  }, []);

  const playClick = useCallback((isAccent: boolean) => {
    const audioContext = ensureAudioContext();
    if (!audioContext) return;

    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = isAccent ? 1000 : 800;
    oscillator.type = "sine";

    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(isAccent ? 0.5 : 0.3, now);
    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    oscillator.start(now);
    oscillator.stop(now + 0.05);
  }, [ensureAudioContext]);

  const startMetronome = useCallback(() => {
    const beats = beatsPerBar[timeSignature];
    let beat = 0;

    // Play first beat immediately
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

  // Handle play/stop
  useEffect(() => {
    if (isPlaying) {
      startMetronome();
    } else {
      stopMetronome();
    }
    return () => stopMetronome();
  }, [isPlaying, startMetronome, stopMetronome]);

  // Restart metronome when BPM or time signature changes while playing
  useEffect(() => {
    if (isPlaying) {
      stopMetronome();
      startMetronome();
    }
  }, [bpm, timeSignature]);

  const beats = beatsPerBar[timeSignature];

  return (
    <div className="w-full px-4 py-3 bg-card rounded-lg border border-border space-y-3">
      {/* Controls Row */}
      <div className="flex flex-wrap items-center gap-4">
        {/* On/Off Switch */}
        <div className="flex items-center gap-3">
          <Switch
            checked={isPlaying}
            onCheckedChange={setIsPlaying}
            id="metronome-toggle"
          />
          <Label htmlFor="metronome-toggle" className="text-foreground cursor-pointer">
            Metronome
          </Label>
        </div>

        {/* BPM Slider */}
        <div className="flex items-center gap-3 flex-1 min-w-[200px] max-w-[400px]">
          <span className="text-sm font-medium text-foreground whitespace-nowrap">
            BPM: {bpm}
          </span>
          <Slider
            value={[bpm]}
            onValueChange={(value) => setBpm(value[0])}
            min={40}
            max={220}
            step={1}
            className="flex-1"
          />
        </div>

        {/* Time Signature */}
        <Select value={timeSignature} onValueChange={setTimeSignature}>
          <SelectTrigger className="w-20 h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="2/4">2/4</SelectItem>
            <SelectItem value="3/4">3/4</SelectItem>
            <SelectItem value="4/4">4/4</SelectItem>
            <SelectItem value="6/8">6/8</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* BPM Description */}
      <div className="text-sm text-muted-foreground">
        {getBpmDescription(bpm)}
      </div>

      {/* Beat Indicators */}
      <div className="flex items-center justify-center gap-2">
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
                ${isActive 
                  ? `bg-primary ${isFirstBeat ? "ring-2 ring-primary/50 scale-125" : "scale-110"}` 
                  : "bg-muted border border-muted-foreground/30"
                }
              `}
            />
          );
        })}
      </div>
    </div>
  );
};
