import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";

const accentPresetOptions: Record<string, { id: string; label: string; accents: number[] }[]> = {
  "2/4": [
    { id: "downbeat", label: "Downbeat only", accents: [1] },
    { id: "march", label: "Both beats", accents: [1, 2] },
  ],
  "3/4": [
    { id: "downbeat", label: "Downbeat only", accents: [1] },
    { id: "waltz", label: "Strong-weak-weak", accents: [1] },
    { id: "one-three", label: "1 & 3", accents: [1, 3] },
  ],
  "4/4": [
    { id: "downbeat", label: "Downbeat only", accents: [1] },
    { id: "backbeat", label: "Backbeat (1 & 3)", accents: [1, 3] },
    { id: "all", label: "All beats", accents: [1, 2, 3, 4] },
  ],
  "5/4": [
    { id: "downbeat", label: "Downbeat only", accents: [1] },
    { id: "three-two", label: "3+2 grouping", accents: [1, 4] },
  ],
  "5/8": [
    { id: "downbeat", label: "Downbeat only", accents: [1] },
    { id: "three-two", label: "3+2 grouping", accents: [1, 4] },
    { id: "two-three", label: "2+3 grouping", accents: [1, 3] },
  ],
  "6/8": [
    { id: "downbeat", label: "Downbeat only", accents: [1] },
    { id: "jig", label: "1 & 4", accents: [1, 4] },
  ],
  "7/8": [
    { id: "downbeat", label: "Downbeat only", accents: [1] },
    { id: "223", label: "2+2+3", accents: [1, 3, 5] },
    { id: "322", label: "3+2+2", accents: [1, 4, 6] },
  ],
  "9/8": [
    { id: "downbeat", label: "Downbeat only", accents: [1] },
    { id: "waltz-triplet", label: "3+3+3", accents: [1, 4, 7] },
  ],
  "12/8": [
    { id: "downbeat", label: "Downbeat only", accents: [1] },
    { id: "four-feel", label: "4 feel (1-4-7-10)", accents: [1, 4, 7, 10] },
  ],
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
  if (bpm <= 240) return "🧠 Extreme — Ultra-fast or double-time feel recommended.";
  return "🎯 Precision drill — Subdivide or half-time feel recommended.";
};

const soundTypeLabels: Record<MetronomeSoundType, string> = {
  classic: "Classic Click",
  woodblock: "Woodblock",
  digital: "Digital Tick",
  hihat: "Hi-Hat",
  clave: "Clave Bell",
};

const SCHEDULE_AHEAD_TIME = 0.1;
const LOOKAHEAD_INTERVAL = 25;

export type BeatUnit = "quarter" | "eighth" | "dottedQuarter";

export type FeelPreset =
  | "straight_beats"
  | "straight_8ths"
  | "triplets"
  | "straight_16ths"
  | "swing_light"
  | "swing_medium"
  | "swing_heavy"
  | "shuffle";

const feelOptions: { id: FeelPreset; label: string; description: string }[] = [
  { id: "straight_beats", label: "Straight (beats)", description: "One click per beat" },
  { id: "straight_8ths", label: "Straight 8ths", description: "Even eighth notes" },
  { id: "triplets", label: "Triplets", description: "Three clicks per beat" },
  { id: "straight_16ths", label: "Straight 16ths", description: "Even sixteenths" },
  { id: "swing_light", label: "Swing (light)", description: "Gentle shuffle" },
  { id: "swing_medium", label: "Swing (medium)", description: "Classic swing" },
  { id: "swing_heavy", label: "Swing (heavy)", description: "Hard shuffle" },
  { id: "shuffle", label: "Shuffle", description: "Laid-back shuffle" },
];

interface FeelConfig {
  subdivision: 1 | 2 | 3 | 4;
  swingAmount?: number;
}

const feelConfigMap: Record<FeelPreset, FeelConfig> = {
  straight_beats: { subdivision: 1, swingAmount: 0 },
  straight_8ths: { subdivision: 2, swingAmount: 0 },
  triplets: { subdivision: 3, swingAmount: 0 },
  straight_16ths: { subdivision: 4, swingAmount: 0 },
  swing_light: { subdivision: 2, swingAmount: 0.3 },
  swing_medium: { subdivision: 2, swingAmount: 0.5 },
  swing_heavy: { subdivision: 2, swingAmount: 0.7 },
  shuffle: { subdivision: 2, swingAmount: 0.65 },
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

interface ParsedTimeSignature {
  numerator: number;
  denominator: number;
}

interface StepPlan {
  stepsPerBar: number;
  beatsPerBar: number;
  subdivision: number;
  stepLevels: number[];
  stepDurations: number[];
}

const parseTimeSignature = (timeSignature: string): ParsedTimeSignature => {
  const [num, den] = timeSignature.split("/").map((v) => parseInt(v, 10));
  return { numerator: num || 4, denominator: den || 4 };
};

const getDefaultBeatUnit = (timeSignature: string): BeatUnit => {
  const { numerator, denominator } = parseTimeSignature(timeSignature);
  if (denominator === 4) return "quarter";
  if (denominator === 8 && numerator % 3 === 0 && numerator >= 6) return "dottedQuarter";
  return "eighth";
};

const normalizeBeatUnitForSignature = (beatUnit: BeatUnit, timeSignature: string): BeatUnit => {
  const { numerator, denominator } = parseTimeSignature(timeSignature);
  if (denominator === 4) return "quarter";
  if (denominator === 8) {
    if (beatUnit === "dottedQuarter" && numerator % 3 === 0 && numerator >= 6) return "dottedQuarter";
    return "eighth";
  }
  return beatUnit;
};

const getBeatsPerBar = (timeSignature: string, beatUnit: BeatUnit): number => {
  const { numerator, denominator } = parseTimeSignature(timeSignature);

  if (denominator === 4) return numerator;
  if (denominator === 8 && beatUnit === "eighth") return numerator;
  if (denominator === 8 && beatUnit === "dottedQuarter" && numerator % 3 === 0) return numerator / 3;
  return numerator;
};

const mapAccentBeatsToBeatUnit = (
  accents: number[],
  timeSignature: string,
  beatUnit: BeatUnit,
  beatsPerBar: number,
): Set<number> => {
  const { numerator, denominator } = parseTimeSignature(timeSignature);

  if (denominator === 8 && beatUnit === "dottedQuarter" && numerator % 3 === 0) {
    const mapped = accents.map((beat) => Math.min(beatsPerBar, Math.max(1, Math.ceil(beat / 3))));
    return new Set(mapped);
  }

  const clamped = accents.map((beat) => Math.min(beatsPerBar, Math.max(1, beat)));
  return new Set(clamped);
};

const createStepPlan = (
  bpm: number,
  beatsPerBar: number,
  subdivision: number,
  accentBeats: Set<number>,
  useCustomAccents: boolean,
  customAccentLevels: number[] | null,
  swingAmount: number,
): StepPlan => {
  const beatDuration = 60 / bpm;
  const stepsPerBar = beatsPerBar * subdivision;
  const barDuration = beatDuration * beatsPerBar;

  const stepOffsets: number[] = [];

  for (let beat = 0; beat < beatsPerBar; beat += 1) {
    const beatStart = beat * beatDuration;

    if (subdivision === 1) {
      stepOffsets.push(beatStart);
      continue;
    }

    if (subdivision === 2) {
      const longRatio = swingAmount > 0 ? 0.5 * (1 - swingAmount) + (2 / 3) * swingAmount : 0.5;
      stepOffsets.push(beatStart, beatStart + beatDuration * longRatio);
      continue;
    }

    const stepLength = beatDuration / subdivision;
    for (let step = 0; step < subdivision; step += 1) {
      stepOffsets.push(beatStart + step * stepLength);
    }
  }

  const stepDurations: number[] = stepOffsets.map((offset, idx) => {
    const nextOffset = idx + 1 < stepOffsets.length ? stepOffsets[idx + 1] : barDuration;
    return nextOffset - offset;
  });

  const defaultStepLevels: number[] = [];
  for (let beat = 0; beat < beatsPerBar; beat += 1) {
    const isAccentBeat = accentBeats.has(beat + 1);
    for (let step = 0; step < subdivision; step += 1) {
      const stepIndex = beat * subdivision + step;
      const level = isAccentBeat && step === 0 ? 2 : 1;
      defaultStepLevels[stepIndex] = level;
    }
  }

  let stepLevels = defaultStepLevels;
  if (useCustomAccents && customAccentLevels && customAccentLevels.length === stepsPerBar) {
    stepLevels = customAccentLevels;
  }

  return {
    stepsPerBar,
    beatsPerBar,
    subdivision,
    stepLevels,
    stepDurations,
  };
};

export const Metronome = ({
  bpm,
  setBpm,
  timeSignature,
  setTimeSignature,
  isPlaying,
  setIsPlaying,
  children,
}: MetronomeProps) => {
  const [volume, setVolume] = useLocalStorage(STORAGE_KEYS.METRONOME_VOLUME, 70);
  const [beatUnit, setBeatUnit] = useLocalStorage<BeatUnit>(
    STORAGE_KEYS.METRONOME_BEAT_UNIT,
    getDefaultBeatUnit(timeSignature),
  );
  const [feel, setFeel] = useLocalStorage<FeelPreset>(STORAGE_KEYS.METRONOME_FEEL, "straight_beats");
  const [advancedSubdivision, setAdvancedSubdivision] = useState<1 | 2 | 3 | 4 | undefined>(undefined);
  const [advancedSwing, setAdvancedSwing] = useState<number | undefined>(undefined);
  const [customAccentLevels, setCustomAccentLevels] = useState<number[] | null>(null);
  const [useCustomAccents, setUseCustomAccents] = useState(false);

  const [currentBeat, setCurrentBeat] = useState(0);
  const [accentPresetBySignature, setAccentPresetBySignature] = useState<Record<string, string>>(() => {
    const initialPresets: Record<string, string> = {};
    Object.entries(accentPresetOptions).forEach(([signature, presets]) => {
      if (presets[0]) {
        initialPresets[signature] = presets[0].id;
      }
    });
    return initialPresets;
  });

  const [storedSoundType, setStoredSoundType] = useLocalStorage<MetronomeSoundType>(
    STORAGE_KEYS.METRONOME_SOUND,
    "classic",
  );

  const { soundType, setSoundType, playClick, ensureAudioReady } = useToneMetronome(storedSoundType);

  const schedulerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const nextStepTimeRef = useRef<number>(0);
  const currentScheduledStepRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);

  const bpmRef = useRef(bpm);
  const tapTimesRef = useRef<number[]>([]);

  useEffect(() => {
    bpmRef.current = bpm;
  }, [bpm]);

  useEffect(() => {
    if (accentPresetBySignature[timeSignature]) return;

    const defaultPreset = accentPresetOptions[timeSignature]?.[0]?.id;
    if (defaultPreset) {
      setAccentPresetBySignature((prev) => ({ ...prev, [timeSignature]: defaultPreset }));
    }
  }, [accentPresetBySignature, timeSignature]);

  useEffect(() => {
    Tone.getDestination().volume.value = Tone.gainToDb(volume / 100);
  }, [volume]);

  const handleSoundTypeChange = (value: string) => {
    const newSoundType = value as MetronomeSoundType;
    setSoundType(newSoundType);
    setStoredSoundType(newSoundType);
  };

  const handleAccentPresetChange = (presetId: string) => {
    setUseCustomAccents(false);
    setAccentPresetBySignature((prev) => ({ ...prev, [timeSignature]: presetId }));
  };

  const handleTapTempo = () => {
    const now = Date.now();
    const filtered = tapTimesRef.current.filter((time) => now - time < 4000);
    filtered.push(now);
    tapTimesRef.current = filtered;

    if (filtered.length < 2) return;

    const intervals: number[] = [];
    for (let i = 1; i < filtered.length; i += 1) {
      intervals.push(filtered[i] - filtered[i - 1]);
    }

    const avgMs = intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const newBpm = Math.min(300, Math.max(20, Math.round(60000 / avgMs)));
    setBpm(newBpm);
  };

  const adjustBpm = (delta: number) => {
    setBpm(Math.min(300, Math.max(20, bpm + delta)));
  };

  const { numerator, denominator } = parseTimeSignature(timeSignature);
  const normalizedBeatUnit = normalizeBeatUnitForSignature(beatUnit, timeSignature);
  const beatsPerBar = getBeatsPerBar(timeSignature, normalizedBeatUnit);
  const feelConfig = feelConfigMap[feel];
  const subdivision = advancedSubdivision ?? feelConfig.subdivision;
  const isSwingFeel = feelConfig.subdivision === 2 && (feelConfig.swingAmount ?? 0) > 0;
  const swingAmount = subdivision === 2 ? (advancedSwing ?? feelConfig.swingAmount ?? 0) : 0;

  const accentPresets = useMemo(() => accentPresetOptions[timeSignature] ?? [], [timeSignature]);
  const currentAccentPresetId = accentPresetBySignature[timeSignature] ?? accentPresets[0]?.id ?? "";
  const currentAccentPreset = accentPresets.find((preset) => preset.id === currentAccentPresetId) ?? accentPresets[0];

  const accentBeats = useMemo(
    () => mapAccentBeatsToBeatUnit(currentAccentPreset?.accents ?? [1], timeSignature, normalizedBeatUnit, beatsPerBar),
    [beatsPerBar, currentAccentPreset?.accents, normalizedBeatUnit, timeSignature],
  );

  const stepsPerBar = beatsPerBar * subdivision;

  const currentFeelOption = useMemo(() => feelOptions.find((option) => option.id === feel) ?? feelOptions[0], [feel]);

  useEffect(() => {
    setBeatUnit((prev) => normalizeBeatUnitForSignature(prev, timeSignature));
  }, [setBeatUnit, timeSignature]);

  useEffect(() => {
    setCustomAccentLevels((prev) => {
      if (!prev) return prev;
      if (prev.length === stepsPerBar) return prev;
      const resized = Array.from({ length: stepsPerBar }, (_, idx) => prev[idx % prev.length] ?? 1);
      return resized;
    });
  }, [stepsPerBar]);

  const stepPlan = useMemo(() => {
    return createStepPlan(
      bpm,
      beatsPerBar,
      subdivision,
      accentBeats,
      useCustomAccents,
      customAccentLevels,
      swingAmount,
    );
  }, [accentBeats, beatsPerBar, bpm, customAccentLevels, subdivision, swingAmount, useCustomAccents]);

  const scheduleStep = useCallback(
    (stepNumber: number, time: number, plan: StepPlan) => {
      const level = plan.stepLevels[stepNumber % plan.stepsPerBar] ?? 1;
      if (level > 0) {
        playClick(level === 2, time);
      }

      const delayMs = Math.max(0, (time - Tone.now()) * 1000);
      setTimeout(() => {
        if (isPlayingRef.current) {
          const beatNumber = Math.floor((stepNumber % plan.stepsPerBar) / plan.subdivision) + 1;
          setCurrentBeat(beatNumber);
        }
      }, delayMs);
    },
    [playClick],
  );

  const scheduler = useCallback(
    (plan: StepPlan) => {
      if (!isPlayingRef.current) return;
      const currentTime = Tone.now();

      while (nextStepTimeRef.current < currentTime + SCHEDULE_AHEAD_TIME) {
        scheduleStep(currentScheduledStepRef.current, nextStepTimeRef.current, plan);
        const stepDuration = plan.stepDurations[currentScheduledStepRef.current % plan.stepsPerBar];
        nextStepTimeRef.current += stepDuration;
        currentScheduledStepRef.current = (currentScheduledStepRef.current + 1) % plan.stepsPerBar;
      }
    },
    [scheduleStep],
  );

  const startMetronome = useCallback(
    async (plan: StepPlan | null) => {
      if (!plan) return;
      await ensureAudioReady();

      isPlayingRef.current = true;
      nextStepTimeRef.current = Tone.now();
      currentScheduledStepRef.current = 0;

      scheduler(plan);
      schedulerIntervalRef.current = setInterval(() => scheduler(plan), LOOKAHEAD_INTERVAL);
    },
    [ensureAudioReady, scheduler],
  );

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
      startMetronome(stepPlan);
    } else {
      stopMetronome();
    }
    return () => stopMetronome();
  }, [isPlaying, startMetronome, stepPlan, stopMetronome]);

  useEffect(() => {
    if (isPlaying) {
      nextStepTimeRef.current = Tone.now();
      currentScheduledStepRef.current = 0;
    }
  }, [bpm, timeSignature, beatUnit, subdivision, isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      stopMetronome();
      startMetronome(stepPlan);
    }
  }, [isPlaying, startMetronome, stepPlan, stopMetronome]);

  const renderAccentGrid = () => (
    <div className="flex flex-wrap gap-2 mt-2">
      {Array.from({ length: stepsPerBar }, (_, idx) => {
        const level = customAccentLevels?.[idx] ?? 1;
        const beatIndex = Math.floor(idx / subdivision) + 1;
        const isAccent = level === 2;
        const isMuted = level === 0;
        const label = `${beatIndex}.${(idx % subdivision) + 1}`;

        const nextLevel = (() => {
          if (level === 0) return 1;
          if (level === 1) return 2;
          return 0;
        })();

        return (
          <Button
            key={idx}
            variant={isMuted ? "outline" : isAccent ? "default" : "secondary"}
            size="sm"
            className="min-w-[3rem]"
            onClick={() => {
              setUseCustomAccents(true);
              setCustomAccentLevels((prev) => {
                const base = prev && prev.length === stepsPerBar ? [...prev] : Array(stepsPerBar).fill(1);
                base[idx] = nextLevel;
                return base;
              });
            }}
          >
            {label}
          </Button>
        );
      })}
    </div>
  );

  return (
    <div className="py-2">
      <div className="flex items-center gap-6 flex-wrap">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              {bpm}, {timeSignature}
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72 bg-popover space-y-2">
            <DropdownMenuLabel>BPM: {bpm}</DropdownMenuLabel>
            <div className="px-2 pb-2">
              <Slider value={[bpm]} onValueChange={(value) => setBpm(value[0])} min={20} max={300} step={1} />
              <p className="text-xs text-muted-foreground mt-2">{getBpmDescription(bpm)}</p>
              <div className="mt-3">
                <Button size="sm" onClick={handleTapTempo} className="w-full">
                  Tap tempo
                </Button>
              </div>
            </div>

            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Time Signature: {timeSignature}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover">
                <DropdownMenuRadioGroup value={timeSignature} onValueChange={setTimeSignature}>
                  <DropdownMenuRadioItem value="2/4">2/4</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="3/4">3/4</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="4/4">4/4</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="5/4">5/4</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="5/8">5/8</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="6/8">6/8</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="7/8">7/8</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="9/8">9/8</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="12/8">12/8</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            {denominator === 8 && (
              <div className="px-2 pb-2 text-sm space-y-2">
                <p className="text-xs text-muted-foreground">Beat interpretation</p>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant={normalizedBeatUnit === "dottedQuarter" ? "default" : "outline"}
                    onClick={() => setBeatUnit("dottedQuarter")}
                    disabled={numerator % 3 !== 0}
                  >
                    Dotted quarter
                  </Button>
                  <Button
                    size="sm"
                    variant={normalizedBeatUnit === "eighth" ? "default" : "outline"}
                    onClick={() => setBeatUnit("eighth")}
                  >
                    Eighth
                  </Button>
                </div>
              </div>
            )}

            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Feel: {currentFeelOption.label}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover space-y-2">
                <DropdownMenuRadioGroup
                  value={feel}
                  onValueChange={(value) => {
                    setFeel(value as FeelPreset);
                    setAdvancedSubdivision(undefined);
                    setAdvancedSwing(undefined);
                  }}
                >
                  {feelOptions.map((option) => (
                    <DropdownMenuRadioItem key={option.id} value={option.id} className="flex flex-col items-start">
                      <span>{option.label}</span>
                      <span className="text-xs text-muted-foreground">{option.description}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Advanced</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-popover space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span>Subdivision override</span>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4].map((value) => (
                          <Button
                            key={value}
                            size="sm"
                            variant={advancedSubdivision === value ? "default" : "outline"}
                            onClick={() =>
                              setAdvancedSubdivision((prev) => (prev === value ? undefined : (value as 1 | 2 | 3 | 4)))
                            }
                          >
                            {value}
                          </Button>
                        ))}
                      </div>
                    </div>

                    {subdivision === 2 && (
                      <div>
                        <div className="flex items-center justify-between text-sm mb-2">
                          <span>Swing amount</span>
                          {isSwingFeel && (
                            <span className="text-xs text-muted-foreground">
                              {Math.round((swingAmount ?? 0) * 100)}%
                            </span>
                          )}
                        </div>
                        <Slider
                          value={[swingAmount * 100]}
                          onValueChange={(value) => setAdvancedSwing(value[0] / 100)}
                          min={0}
                          max={100}
                          step={5}
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          Higher values create a longer first eighth.
                        </p>
                      </div>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Accent pattern: {currentAccentPreset?.label ?? "Downbeat"}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover space-y-2">
                <DropdownMenuRadioGroup
                  value={currentAccentPresetId}
                  onValueChange={(value) => handleAccentPresetChange(value)}
                >
                  {accentPresets.map((preset) => (
                    <DropdownMenuRadioItem key={preset.id} value={preset.id}>
                      {preset.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>

                <DropdownMenuSeparator />
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Advanced</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-popover space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <Switch checked={useCustomAccents} onCheckedChange={setUseCustomAccents} id="custom-accents" />
                        <Label htmlFor="custom-accents" className="cursor-pointer">
                          Use custom grid
                        </Label>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setCustomAccentLevels(null);
                          setUseCustomAccents(false);
                        }}
                      >
                        Reset
                      </Button>
                    </div>
                    {renderAccentGrid()}
                    <p className="text-xs text-muted-foreground">
                      Click cells to cycle silence → normal → accent. Grid length adapts to subdivision.
                    </p>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Sound: {soundTypeLabels[soundType]}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="bg-popover">
                <DropdownMenuRadioGroup value={soundType} onValueChange={handleSoundTypeChange}>
                  <DropdownMenuRadioItem value="classic">Classic Click</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="woodblock">Woodblock</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="digital">Digital Tick</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="hihat">Hi-Hat</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="clave">Clave Bell</DropdownMenuRadioItem>
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
            {Array.from({ length: beatsPerBar }, (_, i) => {
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
