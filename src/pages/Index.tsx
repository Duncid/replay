import { AddNoteSequenceDialog } from "@/components/AddNoteSequenceDialog";
import { AddPartitionDialog } from "@/components/AddPartitionDialog";
import { CompositionSubmenu } from "@/components/CompositionSubmenu";
import {
  FeelPreset,
  Metronome,
  MetronomeSoundType,
} from "@/components/Metronome";
import { MidiConnector } from "@/components/MidiConnector";
import Piano, { PianoHandle } from "@/components/Piano";
import { QuestEditor } from "@/components/QuestEditor";
import { SaveCompositionModal } from "@/components/SaveCompositionModal";
import { TopToastLabel, TopToastProgress } from "@/components/TopToast";
import { UserMenu } from "@/components/UserMenu";
import { WhistleImportSheet } from "@/components/WhistleImportSheet";
import { FreePracticeMode } from "@/components/modes/FreePracticeMode";
import { LabMode } from "@/components/modes/LabMode";
import { LearnMode } from "@/components/modes/LearnMode";
import { PlayEntry, PlayMode } from "@/components/modes/PlayMode";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Composition, useCompositions } from "@/hooks/useCompositions";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useLocalUsers } from "@/hooks/useLocalUsers";
import { MagentaModelType, useMagenta } from "@/hooks/useMagenta";
import { useMidiInput } from "@/hooks/useMidiInput";
import {
  PIANO_SOUND_LABELS,
  PianoSoundType,
  SAMPLED_INSTRUMENTS,
} from "@/hooks/usePianoSound";
import {
  RecordingResult,
  useRecordingManager,
} from "@/hooks/useRecordingManager";
import { supabase } from "@/integrations/supabase/client";
import {
  LessonFeelPreset,
  LessonMetronomeSoundType,
} from "@/types/learningSession";
import { Note, NoteSequence, PlaybackSegment } from "@/types/noteSequence";
import {
  abcToNoteSequence,
  midiToFrequency,
  midiToNoteName,
  musicXmlToNoteSequence,
  noteSequenceToAbc,
} from "@/utils/noteSequenceUtils";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import JSZip from "jszip";
import {
  ChevronDown,
  Download,
  FilePlus,
  Mic,
  MoreHorizontal,
  Music,
  PencilLine,
  Play,
  Save,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

const AI_MODELS = {
  llm: [
    { value: "google/gemini-2.5-flash", label: "Gemini Flash" },
    { value: "google/gemini-2.5-pro", label: "Gemini Pro" },
    { value: "openai/gpt-5", label: "GPT-5" },
  ],
  magenta: [
    {
      value: "magenta/music-rnn",
      label: "MusicRNN",
      description: "Jazz improvisation",
    },
    {
      value: "magenta/music-vae",
      label: "MusicVAE",
      description: "Variation sampling",
    },
  ],
} as const;

type AppState = "idle" | "user_playing" | "waiting_for_ai" | "ai_playing";
type ActiveMode = "play" | "learn" | "quest" | "lab";

// Normalize creativity (0-100) to model-specific temperature ranges
const normalizeCreativityToRNN = (creativity: number): number => {
  const temperature = 0.1 + (creativity / 100) * (2.0 - 0.1);
  console.log(
    `[Creativity] RNN - Creativity: ${creativity}, Temperature: ${temperature.toFixed(
      3,
    )} (range: 0.1-2.0)`,
  );
  return temperature;
};

const normalizeCreativityToVAE = (creativity: number): number => {
  const temperature = 0.1 + (creativity / 100) * (1.5 - 0.1);
  console.log(
    `[Creativity] VAE - Creativity: ${creativity}, Temperature: ${temperature.toFixed(
      3,
    )} (range: 0.1-1.5)`,
  );
  return temperature;
};

const Index = () => {
  const { t, i18n } = useTranslation();
  const { currentUserId } = useLocalUsers();
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [appState, setAppState] = useState<AppState>("idle");
  const [activeMode, setActiveMode] = useLocalStorage<ActiveMode>(
    STORAGE_KEYS.ACTIVE_MODE,
    "play",
  );
  const [isAutoreplyActive, setIsAutoreplyActive] = useLocalStorage<boolean>(
    STORAGE_KEYS.AUTOREPLY,
    false,
  );
  const [selectedModel, setSelectedModel] = useLocalStorage(
    STORAGE_KEYS.AI_MODEL,
    "magenta/music-rnn",
  );
  const [isAskLoading, setIsAskLoading] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [liveNotes, setLiveNotes] = useState<Note[]>([]);
  const [generationLabel, setGenerationLabel] = useState<string | null>(null);
  const [partitionDialogOpen, setPartitionDialogOpen] = useState(false);
  const [editingEntryIndex, setEditingEntryIndex] = useState<number | null>(
    null,
  );
  const [editDialogMode, setEditDialogMode] = useState<"add" | "edit">("add");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalMode, setSaveModalMode] = useState<"save" | "saveAs">("save");
  const [saveBeforeOpenDialogOpen, setSaveBeforeOpenDialogOpen] =
    useState(false);
  const [pendingCompositionToLoad, setPendingCompositionToLoad] =
    useState<Composition | null>(null);
  const [loadPendingAfterSave, setLoadPendingAfterSave] = useState(false);
  const [noteSequenceDialogOpen, setNoteSequenceDialogOpen] = useState(false);
  const [noteSequenceEditIndex, setNoteSequenceEditIndex] = useState<
    number | null
  >(null);
  const [noteSequenceEditMode, setNoteSequenceEditMode] = useState<
    "add" | "edit"
  >("add");
  const [whistleSheetOpen, setWhistleSheetOpen] = useState(false);
  const [questHeaderActions, setQuestHeaderActions] = useState<ReactNode>(null);
  const [questHeaderTitle, setQuestHeaderTitle] = useState<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);

  const [language, setLanguage] = useLocalStorage(STORAGE_KEYS.LANGUAGE, "en");
  const [musicNotation, setMusicNotation] = useLocalStorage<
    "auto" | "abc" | "solfege"
  >(STORAGE_KEYS.MUSIC_NOTATION, "auto");

  // Persisted preferences
  const [pianoSoundType, setPianoSoundType] = useLocalStorage<PianoSoundType>(
    STORAGE_KEYS.INSTRUMENT,
    "classic",
  );
  const [metronomeBpm, setMetronomeBpm] = useLocalStorage(
    STORAGE_KEYS.BPM,
    120,
  );
  const [metronomeTimeSignature, setMetronomeTimeSignature] = useLocalStorage(
    STORAGE_KEYS.TIME_SIGNATURE,
    "4/4",
  );
  const [metronomeIsPlaying, setMetronomeIsPlaying] = useState(false);
  const [metronomeStartTime, setMetronomeStartTime] = useState<number | null>(
    null,
  );
  const [metronomeFeel, setMetronomeFeel] =
    useState<FeelPreset>("straight_beats");
  const [metronomeSoundType, setMetronomeSoundType] =
    useState<MetronomeSoundType>("classic");
  // Creativity slider: 0-100 (stored as magentaTemperature for backward compatibility)
  const [magentaTemperature, setMagentaTemperature] = useLocalStorage<number>(
    STORAGE_KEYS.MAGENTA_TEMPERATURE,
    40,
  );
  // Debug mode
  const [debugMode, setDebugMode] = useLocalStorage<boolean>(
    STORAGE_KEYS.DEBUG_MODE,
    false,
  );

  // Log initial creativity value
  useEffect(() => {
    console.log(
      `[Creativity] Initialized with value: ${magentaTemperature} (0-100 scale)`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only log once on mount

  // Migrate old temperature values (< 100) to creativity scale (0-100) - one-time migration
  // Old RNN default 1.0 → ~47, Old VAE default 0.5 → ~29
  // Use a separate flag to track if migration has been done
  const [migrationDone, setMigrationDone] = useState(() => {
    try {
      return (
        window.localStorage.getItem(
          `${STORAGE_KEYS.MAGENTA_TEMPERATURE}_migrated`,
        ) === "true"
      );
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!migrationDone) {
      // Only migrate if value is in old temperature range (0.1 to 2.0)
      // Values >= 100 or < 0.1 are already in creativity scale or invalid
      if (
        magentaTemperature >= 0.1 &&
        magentaTemperature <= 2.0 &&
        magentaTemperature < 100
      ) {
        // This is an old temperature value, convert to creativity scale
        // Map old range 0.1-2.0 to 0-100 for RNN (most common case)
        const oldTemp = magentaTemperature;
        const creativity = ((oldTemp - 0.1) / (2.0 - 0.1)) * 100;
        const migrated = Math.round(Math.max(0, Math.min(100, creativity)));
        console.log(
          `[Creativity] Migrating old temperature ${oldTemp} to creativity ${migrated}`,
        );
        setMagentaTemperature(migrated);
      }
      // Mark migration as done
      try {
        window.localStorage.setItem(
          `${STORAGE_KEYS.MAGENTA_TEMPERATURE}_migrated`,
          "true",
        );
        setMigrationDone(true);
        console.log(
          `[Creativity] Migration complete. Current creativity value: ${magentaTemperature}`,
        );
      } catch (error) {
        console.warn("[Creativity] Failed to save migration flag:", error);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [migrationDone]); // Only run when migrationDone changes

  // Persisted history
  const [savedPlayHistory, setSavedPlayHistory] = useLocalStorage<PlayEntry[]>(
    STORAGE_KEYS.PLAY_HISTORY,
    [],
  );
  const [isMusicXmlImporting, setIsMusicXmlImporting] = useState(false);

  const { toast } = useToast();
  const magenta = useMagenta();

  useEffect(() => {
    i18n.changeLanguage(language);
  }, [i18n, language]);

  // Language options moved to UserMenu component

  // Compositions hook for cloud save/load
  const handleCompositionLoad = useCallback(
    (composition: {
      data: PlayEntry[];
      instrument: string | null;
      bpm: number | null;
      time_signature: string | null;
    }) => {
      setSavedPlayHistory(composition.data);
      if (composition.instrument)
        setPianoSoundType(composition.instrument as PianoSoundType);
      if (composition.bpm) setMetronomeBpm(composition.bpm);
      if (composition.time_signature)
        setMetronomeTimeSignature(composition.time_signature);
    },
    [
      setSavedPlayHistory,
      setPianoSoundType,
      setMetronomeBpm,
      setMetronomeTimeSignature,
    ],
  );

  const compositions = useCompositions({
    onLoad: handleCompositionLoad,
  });

  const pianoRef = useRef<PianoHandle>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const requestStartTimeRef = useRef<number>(0);
  const aiPlaybackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const noteTimeoutsRef = useRef<NodeJS.Timeout[]>([]);
  const shouldStopAiRef = useRef<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);
  const midiPressedKeysRef = useRef<Set<string>>(new Set());
  const pendingUserSequenceRef = useRef<NoteSequence | null>(null);
  const labNoteHandlerRef = useRef<((noteKey: string) => void) | null>(null);

  const MIN_WAIT_TIME_MS = 1000;

  useEffect(() => {
    const warmupAudio = () => {
      pianoRef.current?.ensureAudioReady();
    };

    const handleFirstInteraction = () => {
      warmupAudio();
      document.removeEventListener("pointerdown", handleFirstInteraction);
      document.removeEventListener("touchstart", handleFirstInteraction);
    };

    document.addEventListener("pointerdown", handleFirstInteraction, {
      once: true,
    });
    document.addEventListener("touchstart", handleFirstInteraction, {
      once: true,
    });

    return () => {
      document.removeEventListener("pointerdown", handleFirstInteraction);
      document.removeEventListener("touchstart", handleFirstInteraction);
    };
  }, []);

  // Mode hooks defined later due to dependency on playSequence/handleReplaySequence
  // (they will be initialized after those functions are defined)

  const [playingSequence, setPlayingSequence] = useState<NoteSequence | null>(
    null,
  );

  // Refs for circular dependency handling
  const handleReplaySequenceRef = useRef<(sequence: NoteSequence) => void>();
  const playModeRef = useRef<ReturnType<typeof PlayMode>>();
  const handlePlayAllSequencesRef =
    useRef<
      (combinedSequence: NoteSequence, segments?: PlaybackSegment[]) => void
    >();

  // Learn mode recording state
  const [learnModeRecording, setLearnModeRecording] =
    useState<NoteSequence | null>(null);
  const learnModeRecordingRef = useRef<NoteSequence | null>(null);
  const [learnModeType, setLearnModeType] = useState<
    "curriculum" | "free-practice"
  >("curriculum");

  // Free practice recording
  const [freePracticeRecording, setFreePracticeRecording] =
    useState<NoteSequence | null>(null);
  const freePracticeRecordingRef = useRef<NoteSequence | null>(null);

  // Recording manager for play mode
  const handleRecordingComplete = useCallback(
    (result: RecordingResult) => {
      setLiveNotes([]); // Clear live notes when recording completes
      if (activeMode === "play") {
        // Add user recording
        playModeRef.current?.addEntry(result.sequence, false);

        if (isAutoreplyActive) {
          // Trigger AI
          handleImprovPlay(result.sequence);
        } else {
          setAppState("idle");
        }
      }
    },
    [activeMode, isAutoreplyActive],
  );

  const handleRecordingUpdate = useCallback((notes: Note[]) => {
    setLiveNotes(notes);
  }, []);

  const recordingManager = useRecordingManager({
    bpm: metronomeBpm,
    timeSignature: metronomeTimeSignature,
    onRecordingComplete: handleRecordingComplete,
    onRecordingUpdate: handleRecordingUpdate,
    pauseTimeoutMs: isAutoreplyActive ? 2000 : 3000,
    resumeGapMs: 1000,
  });

  const handleModeChange = (newMode: ActiveMode) => {
    if (newMode === "learn" && magenta.isMagentaModel(selectedModel)) {
      setSelectedModel("google/gemini-2.5-flash");
    } else if (newMode === "play" && !magenta.isMagentaModel(selectedModel)) {
      setSelectedModel("magenta/music-rnn");
    }
    recordingManager.cancelRecording();
    setActiveMode(newMode);
  };

  const registerLabNoteHandler = useCallback(
    (handler: ((noteKey: string) => void) | null) => {
      labNoteHandlerRef.current = handler;
    },
    [],
  );

  // MIDI note handlers - memoized to ensure stable references for useMidiInput
  const handleMidiNoteOn = useCallback(
    (noteKey: string, frequency: number, velocity: number) => {
      if (
        (appState !== "idle" && appState !== "user_playing") ||
        midiPressedKeysRef.current.has(noteKey)
      )
        return;
      midiPressedKeysRef.current.add(noteKey);
      pianoRef.current?.handleKeyPress(noteKey, frequency, velocity);
    },
    [appState],
  );

  const handleMidiNoteOff = useCallback(
    (noteKey: string, frequency: number) => {
      if (!midiPressedKeysRef.current.has(noteKey)) return;
      midiPressedKeysRef.current.delete(noteKey);
      pianoRef.current?.handleKeyRelease(noteKey, frequency);
    },
    [],
  );

  const handleNoMidiDevices = () => {
    toast({
      title: "No MIDI devices found",
      description: "Please connect a MIDI device and try again.",
      variant: "destructive",
    });
  };

  const handleMidiError = useCallback(
    (errorMessage: string) => {
      toast({
        title: "MIDI connection error",
        description: errorMessage,
        variant: "destructive",
      });
    },
    [toast],
  );

  const {
    connectedDevice,
    error: midiError,
    isSupported: isMidiSupported,
    requestAccess,
    disconnect,
  } = useMidiInput(
    handleMidiNoteOn,
    handleMidiNoteOff,
    handleNoMidiDevices,
    handleMidiError,
  );

  const stopAiPlayback = useCallback(() => {
    shouldStopAiRef.current = true;
    isPlayingRef.current = false;
    setIsPlaying(false);
    noteTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    noteTimeoutsRef.current = [];
    if (aiPlaybackTimeoutRef.current) {
      clearTimeout(aiPlaybackTimeoutRef.current);
      aiPlaybackTimeoutRef.current = null;
    }
    setActiveKeys(new Set());
    setAppState("idle");
    setPlayingSequence(null);
    setIsPlayingAll(false);
  }, []);

  const playSequence = useCallback(
    async (
      sequence: NoteSequence,
      requestId?: string,
      isReplay: boolean = false,
      segments?: PlaybackSegment[],
    ) => {
      setIsReplaying(isReplay);
      const playbackId = Math.random().toString(36).substring(7);

      if (!isReplay && requestId && currentRequestIdRef.current !== requestId) {
        console.log(`[Playback ${playbackId}] Request invalidated`);
        return;
      }

      if (isPlayingRef.current) {
        console.log(
          `[Playback ${playbackId}] Already playing, stopping previous`,
        );
      }

      // Normalize times so first note starts at 0
      const minStartTime =
        sequence.notes.length > 0
          ? Math.min(...sequence.notes.map((n) => n.startTime))
          : 0;
      const normalizedNotes = sequence.notes.map((note) => ({
        ...note,
        startTime: note.startTime - minStartTime,
        endTime: note.endTime - minStartTime,
      }));
      const normalizedSequence = {
        ...sequence,
        notes: normalizedNotes,
        totalTime: sequence.totalTime - minStartTime,
      };

      console.log(
        `[Playback ${playbackId}] Starting: ${
          normalizedSequence.notes.length
        } notes, ${normalizedSequence.totalTime.toFixed(3)}s`,
      );
      const playbackStartTime = Date.now();

      // Clear previous playback state
      shouldStopAiRef.current = true;
      noteTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
      noteTimeoutsRef.current = [];
      if (aiPlaybackTimeoutRef.current) {
        clearTimeout(aiPlaybackTimeoutRef.current);
        aiPlaybackTimeoutRef.current = null;
      }
      setActiveKeys(new Set());
      isPlayingRef.current = true;
      setIsPlaying(true);

      await new Promise((resolve) => setTimeout(resolve, 50));

      if (!isPlayingRef.current) {
        console.log(`[Playback ${playbackId}] Cancelled during delay`);
        return;
      }

      shouldStopAiRef.current = false;
      setAppState("ai_playing");

      // Handle visual state updates
      if (segments && segments.length > 0) {
        // Schedule updates for each segment
        segments.forEach((segment) => {
          // Calculate start and end times relative to playback start
          // segment.startTime is already relative to the start of the combined sequence
          // But we need to account for minStartTime if the combined sequence was normalized?
          // Actually, getCombinedSequence usually starts at 0.
          // Let's assume segment times are aligned with sequence times.

          // However, we normalized the playing sequence by subtracting minStartTime.
          // If the combined sequence started at 0, minStartTime is 0.
          // If combined sequence had a delay at start, we shifted it.
          // We should shift segment times too.

          const segmentStartTime = Math.max(
            0,
            segment.startTime - minStartTime,
          );
          const segmentEndTime = Math.max(0, segment.endTime - minStartTime);

          const startTimeout = setTimeout(() => {
            if (!shouldStopAiRef.current) {
              setPlayingSequence(segment.originalSequence);
            }
          }, segmentStartTime * 1000);
          noteTimeoutsRef.current.push(startTimeout);

          // We don't strictly need to clear it at end time if the next one picks up,
          // but clearing it handles gaps correctly.
          const endTimeout = setTimeout(() => {
            if (!shouldStopAiRef.current) {
              setPlayingSequence((prev) =>
                prev === segment.originalSequence ? null : prev,
              );
            }
          }, segmentEndTime * 1000);
          noteTimeoutsRef.current.push(endTimeout);
        });
      } else {
        // Single sequence playback - highlight immediately
        setPlayingSequence(sequence);
      }

      normalizedSequence.notes.forEach((note) => {
        const noteKey = midiToNoteName(note.pitch);
        const frequency = midiToFrequency(note.pitch);
        const duration = note.endTime - note.startTime;

        const startTimeout = setTimeout(() => {
          if (!shouldStopAiRef.current && pianoRef.current) {
            pianoRef.current.playNote(frequency, duration);
            setActiveKeys((prev) => new Set([...prev, noteKey]));
          }
        }, note.startTime * 1000);
        noteTimeoutsRef.current.push(startTimeout);

        const endTimeout = setTimeout(() => {
          if (!shouldStopAiRef.current) {
            setActiveKeys((prev) => {
              const newSet = new Set(prev);
              newSet.delete(noteKey);
              return newSet;
            });
          }
        }, note.endTime * 1000);
        noteTimeoutsRef.current.push(endTimeout);
      });

      aiPlaybackTimeoutRef.current = setTimeout(() => {
        if (!shouldStopAiRef.current) {
          const elapsed = (Date.now() - playbackStartTime) / 1000;
          console.log(
            `[Playback ${playbackId}] Complete: ${elapsed.toFixed(3)}s`,
          );
          setAppState("idle");
          setPlayingSequence(null);
          setActiveKeys(new Set());
          setIsPlayingAll(false);
          setIsPlaying(false);
          noteTimeoutsRef.current = [];
          isPlayingRef.current = false;
        }
      }, normalizedSequence.totalTime * 1000);
    },
    [],
  );

  const handleLabPlaySequence = useCallback(
    (sequence: NoteSequence) => {
      if (isPlayingRef.current) {
        stopAiPlayback();
      }
      pianoRef.current?.ensureAudioReady();
      setTimeout(() => playSequence(sequence, undefined, true), 50);
    },
    [playSequence, stopAiPlayback],
  );

  function handleReplaySequence(sequence: NoteSequence) {
    if (isPlayingRef.current) return;

    shouldStopAiRef.current = true;
    noteTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    noteTimeoutsRef.current = [];
    if (aiPlaybackTimeoutRef.current) {
      clearTimeout(aiPlaybackTimeoutRef.current);
      aiPlaybackTimeoutRef.current = null;
    }
    setActiveKeys(new Set());

    pianoRef.current?.ensureAudioReady();
    setTimeout(() => playSequence(sequence, undefined, true), 50);
  }

  // Assign to ref for use in callbacks defined earlier
  handleReplaySequenceRef.current = handleReplaySequence;

  // Handle playing all sequences
  const handlePlayAllSequences = useCallback(
    (combinedSequence: NoteSequence, segments?: PlaybackSegment[]) => {
      if (isPlayingRef.current) return;

      setIsPlayingAll(true);
      pianoRef.current?.ensureAudioReady();
      setTimeout(
        () => playSequence(combinedSequence, undefined, true, segments),
        50,
      );
    },
    [playSequence],
  );

  // Handle upload ABC file
  const handleUploadAbc = useCallback(async () => {
    try {
      if (!("showOpenFilePicker" in window)) {
        toast({
          title: "File picker not supported",
          description:
            "Your browser doesn't support the File System Access API. Please use 'Write ABC' instead.",
          variant: "destructive",
        });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fileHandles = await (window as any).showOpenFilePicker({
        types: [
          {
            description: "Text files",
            accept: { "text/plain": [".txt"] },
          },
        ],
        multiple: false,
      });

      if (!fileHandles || fileHandles.length === 0) return;

      const file = await fileHandles[0].getFile();
      const text = await file.text();

      // Validate ABC format by attempting to parse
      try {
        const sequence = abcToNoteSequence(text, metronomeBpm);
        if (sequence.notes.length === 0) {
          toast({
            title: "Invalid ABC file",
            description:
              "The file contains no valid notes. Please check the ABC format.",
            variant: "destructive",
          });
          return;
        }

        // Add to history
        if (activeMode === "play") {
          playModeRef.current?.addEntry(sequence, false);
          toast({ title: "ABC file uploaded and added" });
        }
      } catch (error) {
        toast({
          title: "Invalid ABC format",
          description:
            error instanceof Error
              ? error.message
              : "Unable to parse ABC notation from file",
          variant: "destructive",
        });
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("File upload error:", error);
        toast({
          title: "Error uploading file",
          description:
            error instanceof Error ? error.message : "Failed to read file",
          variant: "destructive",
        });
      }
      // AbortError means user cancelled - no need to show error
    }
  }, [metronomeBpm, activeMode, toast]);

  const handleUploadMusicXml = useCallback(async () => {
    const processXmlFile = async (file: File) => {
      setIsMusicXmlImporting(true);
      try {
        let xmlText: string;
        const fileName = file.name.toLowerCase();

        // Check if it's an MXL file (compressed MusicXML)
        if (fileName.endsWith(".mxl")) {
          // MXL files are ZIP archives - extract the XML
          const arrayBuffer = await file.arrayBuffer();
          const zip = await JSZip.loadAsync(arrayBuffer);

          const containerFile = zip.files["META-INF/container.xml"];
          let mainXmlPath: string | null = null;

          if (containerFile) {
            try {
              const containerText = await containerFile.async("string");
              const containerDoc = new DOMParser().parseFromString(
                containerText,
                "application/xml",
              );
              if (
                containerDoc.getElementsByTagName("parsererror").length === 0
              ) {
                const rootFile =
                  containerDoc.getElementsByTagName("rootfile")[0] ??
                  containerDoc.getElementsByTagNameNS("*", "rootfile")[0];
                const fullPath = rootFile?.getAttribute("full-path");
                if (fullPath) {
                  mainXmlPath = fullPath;
                }
              }
            } catch (error) {
              console.warn("Failed to parse MXL container.xml", error);
            }
          }

          if (!mainXmlPath || !zip.files[mainXmlPath]) {
            // Find the main MusicXML file (exclude META-INF folder)
            const xmlFiles = Object.keys(zip.files).filter(
              (name) =>
                (name.endsWith(".xml") || name.endsWith(".musicxml")) &&
                !name.startsWith("META-INF/") &&
                !zip.files[name].dir,
            );

            if (xmlFiles.length === 0) {
              throw new Error("No XML file found in MXL archive");
            }

            // Prefer MusicXML files in the root directory, or use the first one
            const rootXmlFiles = xmlFiles.filter((name) => !name.includes("/"));
            const rootMusicXmlFiles = rootXmlFiles.filter((name) =>
              name.endsWith(".musicxml"),
            );
            const preferredRoot = rootMusicXmlFiles[0] ?? rootXmlFiles[0];
            mainXmlPath = preferredRoot ?? xmlFiles[0];
          }

          const xmlFile = zip.files[mainXmlPath];

          if (!xmlFile) {
            throw new Error("Could not extract XML from MXL archive");
          }

          xmlText = await xmlFile.async("string");
        } else {
          // Regular XML/MusicXML file
          xmlText = await file.text();
        }

        const sequence = await musicXmlToNoteSequence(xmlText, {
          defaultQpm: metronomeBpm,
          defaultVelocity: 0.8,
        });

        if (sequence.notes.length === 0) {
          toast({
            title: "Invalid MusicXML file",
            description:
              "The file contains no valid notes. Please check the MusicXML content.",
            variant: "destructive",
          });
          return;
        }

        if (activeMode === "play") {
          playModeRef.current?.addEntry(sequence, false);
          toast({ title: "MusicXML file uploaded and added" });
        }
      } catch (error) {
        console.error("MusicXML upload error:", error);
        toast({
          title: "Error importing MusicXML",
          description:
            error instanceof Error ? error.message : "Failed to read file",
          variant: "destructive",
        });
      } finally {
        setIsMusicXmlImporting(false);
      }
    };

    try {
      // Use File System Access API if available (modern browsers)
      if ("showOpenFilePicker" in window) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileHandles = await (window as any).showOpenFilePicker({
          types: [
            {
              description: "MusicXML files",
              accept: {
                "application/vnd.recordare.musicxml+xml": [".mxl"],
                "application/vnd.recordare.musicxml": [".mxl"],
                "application/zip": [".mxl"],
                "application/xml": [".xml", ".musicxml"],
                "text/xml": [".xml", ".musicxml"],
              },
            },
          ],
          multiple: false,
        });

        if (!fileHandles || fileHandles.length === 0) return;

        const file = await fileHandles[0].getFile();
        await processXmlFile(file);
      } else {
        // Fallback: Use traditional file input for browsers without File System Access API
        const input = document.createElement("input");
        input.type = "file";
        input.accept =
          ".mxl,.xml,.musicxml,application/vnd.recordare.musicxml+xml,application/xml,text/xml";
        input.style.display = "none";
        document.body.appendChild(input);

        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          document.body.removeChild(input);

          if (!file) return;
          await processXmlFile(file);
        };

        input.click();
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("MusicXML upload error:", error);
        toast({
          title: "Error importing MusicXML",
          description:
            error instanceof Error ? error.message : "Failed to read file",
          variant: "destructive",
        });
      }
      // AbortError means user cancelled - no need to show error
    }
  }, [metronomeBpm, activeMode, toast]);

  const handleUploadMidi = useCallback(async () => {
    const normalizeVelocity = (value?: number) => {
      if (typeof value !== "number" || Number.isNaN(value)) return 0.8;
      const normalized = value > 1 ? value / 127 : value;
      return Math.min(1, Math.max(0, normalized));
    };

    const normalizeSequence = (sequence: NoteSequence): NoteSequence => {
      const [numerator, denominator] = metronomeTimeSignature
        .split("/")
        .map(Number);
      const notes = (sequence.notes ?? []).map((note) => ({
        ...note,
        velocity: normalizeVelocity(note.velocity),
      }));
      const minStartTime = notes.length
        ? Math.min(...notes.map((note) => note.startTime))
        : 0;

      if (minStartTime > 0) {
        notes.forEach((note) => {
          note.startTime -= minStartTime;
          note.endTime -= minStartTime;
        });
      }

      const totalTime =
        sequence.totalTime && sequence.totalTime > 0
          ? sequence.totalTime - (minStartTime > 0 ? minStartTime : 0)
          : notes.reduce((max, note) => Math.max(max, note.endTime), 0);

      return {
        ...sequence,
        notes,
        totalTime,
        tempos: sequence.tempos?.length
          ? sequence.tempos
          : [{ time: 0, qpm: metronomeBpm }],
        timeSignatures: sequence.timeSignatures?.length
          ? sequence.timeSignatures
          : [{ time: 0, numerator, denominator }],
      };
    };

    const processMidiFile = async (file: File) => {
      if (!window.mm) {
        toast({
          title: "MIDI import unavailable",
          description:
            "Magenta is still loading. Please wait a moment and try again.",
          variant: "destructive",
        });
        return;
      }

      const arrayBuffer = await file.arrayBuffer();
      const midiData = new Uint8Array(arrayBuffer);
      const sequence = window.mm.midiToSequenceProto(midiData) as NoteSequence;
      const normalized = normalizeSequence(sequence);

      if (normalized.notes.length === 0) {
        toast({
          title: "Invalid MIDI file",
          description: "The file contains no valid notes.",
          variant: "destructive",
        });
        return;
      }

      if (activeMode === "play") {
        playModeRef.current?.addEntry(normalized, false);
        toast({ title: "MIDI file uploaded and added" });
      }
    };

    try {
      if ("showOpenFilePicker" in window) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileHandles = await (window as any).showOpenFilePicker({
          types: [
            {
              description: "MIDI files",
              accept: {
                "audio/midi": [".mid", ".midi"],
                "audio/mid": [".mid", ".midi"],
                "application/octet-stream": [".mid", ".midi"],
              },
            },
          ],
          multiple: false,
        });

        if (!fileHandles || fileHandles.length === 0) return;

        const file = await fileHandles[0].getFile();
        await processMidiFile(file);
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept =
          ".mid,.midi,audio/midi,audio/mid,application/octet-stream";
        input.style.display = "none";
        document.body.appendChild(input);

        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          document.body.removeChild(input);
          if (!file) return;
          await processMidiFile(file);
        };

        input.click();
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("MIDI upload error:", error);
        toast({
          title: "Error importing MIDI",
          description:
            error instanceof Error ? error.message : "Failed to read file",
          variant: "destructive",
        });
      }
    }
  }, [activeMode, metronomeBpm, metronomeTimeSignature, toast]);

  const handleUploadNoteSequence = useCallback(async () => {
    const validateNoteSequence = (data: unknown): boolean => {
      if (!data || typeof data !== "object") return false;
      const obj = data as Record<string, unknown>;

      if (!Array.isArray(obj.notes)) return false;

      for (const note of obj.notes as unknown[]) {
        if (!note || typeof note !== "object") return false;
        const n = note as Record<string, unknown>;
        if (typeof n.pitch !== "number" || n.pitch < 0 || n.pitch > 127)
          return false;
        if (typeof n.startTime !== "number" || n.startTime < 0) return false;
        if (typeof n.endTime !== "number" || n.endTime < 0) return false;
        if (n.endTime <= n.startTime) return false;
        // Allow velocity in either 0-1 or 0-127 range
        if (
          typeof n.velocity !== "number" ||
          n.velocity < 0 ||
          n.velocity > 127
        )
          return false;
      }
      return true;
    };

    const normalizeVelocity = (value?: number) => {
      if (typeof value !== "number" || Number.isNaN(value)) return 0.8;
      // If velocity > 1, assume it's MIDI (0-127) and normalize
      const normalized = value > 1 ? value / 127 : value;
      return Math.min(1, Math.max(0, normalized));
    };

    const normalizeSequence = (data: Record<string, unknown>): NoteSequence => {
      const notes = (data.notes as Array<Record<string, unknown>>).map(
        (note) => ({
          pitch: note.pitch as number,
          startTime: note.startTime as number,
          endTime: note.endTime as number,
          velocity: normalizeVelocity(note.velocity as number),
        }),
      );

      const totalTime =
        typeof data.totalTime === "number" && data.totalTime > 0
          ? data.totalTime
          : notes.reduce((max, note) => Math.max(max, note.endTime), 0);

      return {
        notes,
        totalTime,
        tempos: Array.isArray(data.tempos)
          ? (data.tempos as NoteSequence["tempos"])
          : undefined,
        timeSignatures: Array.isArray(data.timeSignatures)
          ? (data.timeSignatures as NoteSequence["timeSignatures"])
          : undefined,
      };
    };

    const processNsFile = async (file: File) => {
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!validateNoteSequence(parsed)) {
          toast({
            title: "Invalid NoteSequence file",
            description:
              "The file does not contain a valid NoteSequence structure.",
            variant: "destructive",
          });
          return;
        }

        const sequence = normalizeSequence(parsed as Record<string, unknown>);

        if (sequence.notes.length === 0) {
          toast({
            title: "Empty NoteSequence",
            description: "The file contains no notes.",
            variant: "destructive",
          });
          return;
        }

        if (activeMode === "play") {
          playModeRef.current?.addEntry(sequence, false);
          toast({ title: "NoteSequence file uploaded and added" });
        }
      } catch (error) {
        console.error("NoteSequence upload error:", error);
        toast({
          title: "Error importing NoteSequence",
          description:
            error instanceof Error ? error.message : "Failed to parse file",
          variant: "destructive",
        });
      }
    };

    try {
      if ("showOpenFilePicker" in window) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fileHandles = await (window as any).showOpenFilePicker({
          types: [
            {
              description: "NoteSequence JSON files",
              accept: {
                "application/json": [".ns.json", ".json"],
              },
            },
          ],
          multiple: false,
        });

        if (!fileHandles || fileHandles.length === 0) return;

        const file = await fileHandles[0].getFile();
        await processNsFile(file);
      } else {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".ns.json,.json,application/json";
        input.style.display = "none";
        document.body.appendChild(input);

        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          document.body.removeChild(input);
          if (!file) return;
          await processNsFile(file);
        };

        input.click();
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        console.error("NoteSequence upload error:", error);
        toast({
          title: "Error importing NoteSequence",
          description:
            error instanceof Error ? error.message : "Failed to read file",
          variant: "destructive",
        });
      }
    }
  }, [activeMode, toast]);

  // Play mode hook
  const playMode = PlayMode({
    bpm: metronomeBpm,
    timeSignature: metronomeTimeSignature,
    onReplay: handleReplaySequence,
    onPlayAll: handlePlayAllSequences,
    onStopPlayback: stopAiPlayback,
    onClearHistory: () => toast({ title: "History cleared" }),
    liveNotes,
    isRecording: appState === "user_playing" && activeMode === "play",
    isPlaying,
    isPlayingAll,
    initialHistory: savedPlayHistory,
    onHistoryChange: setSavedPlayHistory,
    onRequestImprov: (sequence) =>
      handleManualAiRequest(sequence, "magenta/music-rnn", "create an improv"),
    onRequestVariations: (sequence) =>
      handleManualAiRequest(sequence, "magenta/music-vae", "create variations"),
    playingSequence,
    isImporting: isMusicXmlImporting,
    importLabel: "Importing MusicXML...",
  });

  // Assign to refs for use in handleRecordingComplete
  playModeRef.current = playMode;

  const loadCompositionWithToast = useCallback(
    (composition: Composition) => {
      compositions.loadComposition(composition);
      toast({ title: `Loaded "${composition.title}"` });
      setPendingCompositionToLoad(null);
      setSaveBeforeOpenDialogOpen(false);
    },
    [compositions, toast],
  );

  const handleContinueWithoutSaving = useCallback(() => {
    if (pendingCompositionToLoad) {
      loadCompositionWithToast(pendingCompositionToLoad);
    }
  }, [loadCompositionWithToast, pendingCompositionToLoad]);

  const handleSaveAndLoadExisting = useCallback(async () => {
    if (!pendingCompositionToLoad || !compositions.currentComposition) return;

    const success = await compositions.updateComposition(
      compositions.currentComposition.id,
      playMode.history,
      pianoSoundType,
      metronomeBpm,
      metronomeTimeSignature,
    );

    if (success) {
      loadCompositionWithToast(pendingCompositionToLoad);
    }
  }, [
    compositions,
    loadCompositionWithToast,
    metronomeBpm,
    metronomeTimeSignature,
    pendingCompositionToLoad,
    pianoSoundType,
    playMode,
  ]);

  const handleSaveAsNewBeforeLoad = useCallback(() => {
    setSaveModalMode("save");
    setLoadPendingAfterSave(true);
    setSaveModalOpen(true);
    setSaveBeforeOpenDialogOpen(false);
  }, []);

  // Learn mode recording manager (for curriculum lessons)
  const learnRecordingManager = useRecordingManager({
    bpm: metronomeBpm,
    timeSignature: metronomeTimeSignature,
    onRecordingComplete: (result) => {
      setLearnModeRecording(result.sequence);
      learnModeRecordingRef.current = result.sequence;
      setAppState("idle");
    },
    pauseTimeoutMs: 2000,
    resumeGapMs: 1000,
    metronomeIsPlaying:
      activeMode === "learn" && learnModeType === "curriculum"
        ? metronomeIsPlaying
        : false,
    metronomeStartTime:
      activeMode === "learn" && learnModeType === "curriculum"
        ? metronomeStartTime ?? undefined
        : undefined,
  });

  // Free practice recording manager
  const freePracticeRecordingManager = useRecordingManager({
    bpm: metronomeBpm,
    timeSignature: metronomeTimeSignature,
    onRecordingComplete: (result) => {
      setFreePracticeRecording(result.sequence);
      freePracticeRecordingRef.current = result.sequence;
      setAppState("idle");
    },
    pauseTimeoutMs: 2000,
    resumeGapMs: 1000,
    metronomeIsPlaying:
      activeMode === "learn" && learnModeType === "free-practice"
        ? metronomeIsPlaying
        : false,
    metronomeStartTime:
      activeMode === "learn" && learnModeType === "free-practice"
        ? metronomeStartTime ?? undefined
        : undefined,
  });

  // Track tune mode state for recording logic (separate from learnMode to avoid circular reference)
  const [isInTuneMode, setIsInTuneMode] = useState(false);

  // Learn mode hook (curriculum lessons)
  const learnMode = LearnMode({
    isPlaying: appState === "ai_playing",
    onPlaySequence: (sequence) => {
      pianoRef.current?.ensureAudioReady();
      setTimeout(() => playSequence(sequence, undefined, true), 50);
    },
    onStartRecording: () => {
      // Recording starts automatically when user plays
    },
    isRecording:
      appState === "user_playing" &&
      activeMode === "learn" &&
      learnModeType === "curriculum",
    userRecording: learnModeRecording,
    onClearRecording: () => {
      setLearnModeRecording(null);
      learnModeRecordingRef.current = null;
    },
    language,
    model: selectedModel,
    debugMode,
    localUserId: currentUserId,
    // Metronome control props
    metronomeBpm,
    setMetronomeBpm,
    metronomeTimeSignature,
    setMetronomeTimeSignature,
    metronomeIsPlaying,
    setMetronomeIsPlaying,
    setMetronomeFeel: (feel: LessonFeelPreset) =>
      setMetronomeFeel(feel as FeelPreset),
    setMetronomeSoundType: (soundType: LessonMetronomeSoundType) =>
      setMetronomeSoundType(soundType as MetronomeSoundType),
  });

  const { resetToStart: resetLearnToStart } = learnMode;

  // Sync tune mode state from LearnMode
  useEffect(() => {
    setIsInTuneMode(learnMode.isInTuneMode);
  }, [learnMode.isInTuneMode]);

  // Reset learn flow when the current user changes
  useEffect(() => {
    if (
      previousUserIdRef.current &&
      currentUserId &&
      previousUserIdRef.current !== currentUserId
    ) {
      console.log(
        `[UserSwitch] Switched user from ${previousUserIdRef.current} to ${currentUserId}`,
      );
      stopAiPlayback();
      recordingManager.cancelRecording();
      learnRecordingManager.cancelRecording();
      freePracticeRecordingManager.cancelRecording();
      setLearnModeRecording(null);
      learnModeRecordingRef.current = null;
      setFreePracticeRecording(null);
      freePracticeRecordingRef.current = null;
      setLearnModeType("curriculum");
      setAppState("idle");
      resetLearnToStart();
    }

    previousUserIdRef.current = currentUserId ?? null;
  }, [
    currentUserId,
    stopAiPlayback,
    recordingManager,
    learnRecordingManager,
    freePracticeRecordingManager,
    resetLearnToStart,
  ]);

  // Free practice mode props (used in JSX)
  const freePracticeModeProps = {
    isPlaying: appState === "ai_playing",
    onPlaySequence: (sequence: NoteSequence) => {
      pianoRef.current?.ensureAudioReady();
      setTimeout(() => playSequence(sequence, undefined, true), 50);
    },
    isRecording:
      appState === "user_playing" &&
      activeMode === "learn" &&
      learnModeType === "free-practice",
    userRecording: freePracticeRecording,
    onClearRecording: () => {
      setFreePracticeRecording(null);
      freePracticeRecordingRef.current = null;
    },
    language,
    model: selectedModel,
    // Metronome control props
    metronomeBpm,
    setMetronomeBpm,
    metronomeTimeSignature,
    setMetronomeTimeSignature,
    metronomeIsPlaying,
    setMetronomeIsPlaying,
    setMetronomeFeel: (feel: LessonFeelPreset) =>
      setMetronomeFeel(feel as FeelPreset),
    setMetronomeSoundType: (soundType: LessonMetronomeSoundType) =>
      setMetronomeSoundType(soundType as MetronomeSoundType),
    onLeave: () => {
      setLearnModeType("curriculum");
    },
  };

  // Handle note events from Piano
  const handleNoteStart = useCallback(
    (noteKey: string, frequency: number, velocity: number) => {
      if (appState === "ai_playing") {
        stopAiPlayback();
      }

      if (activeMode === "learn") {
        if (learnModeType === "curriculum") {
          learnMode.handleUserAction();
        }
      }

      if (appState !== "user_playing") {
        currentRequestIdRef.current = null;
        recordingManager.hideProgress();
        learnRecordingManager.hideProgress();
        freePracticeRecordingManager.hideProgress();
        setAppState("user_playing");
      }

      if (activeMode === "lab") {
        labNoteHandlerRef.current?.(noteKey);
      }

      if (activeMode === "play") {
        recordingManager.addNoteStart(noteKey, velocity);
      } else if (activeMode === "learn") {
        if (learnModeType === "curriculum") {
          // TuneMode: Always record when a tune is active
          if (isInTuneMode) {
            learnRecordingManager.addNoteStart(noteKey, velocity);
          } else if (
            learnMode.lesson.phase === "your_turn" &&
            learnMode.lessonMode === "evaluation"
          ) {
            // Lesson mode: Only record in evaluation mode
            learnRecordingManager.addNoteStart(noteKey, velocity);
          }
        } else if (learnModeType === "free-practice") {
          // Always record for free practice
          freePracticeRecordingManager.addNoteStart(noteKey, velocity);
        }
      }
    },
    [
      appState,
      activeMode,
      recordingManager,
      learnMode.handleUserAction,
      learnMode.lesson.phase,
      learnMode.lessonMode,
      learnRecordingManager,
      freePracticeRecordingManager,
      learnModeType,
      isInTuneMode,
      stopAiPlayback,
    ],
  );

  const handleNoteEnd = useCallback(
    (noteKey: string, frequency: number) => {
      if (activeMode === "play") {
        recordingManager.addNoteEnd(noteKey);
      } else if (activeMode === "learn") {
        if (learnModeType === "curriculum") {
          // TuneMode: Always record when a tune is active
          if (isInTuneMode) {
            learnRecordingManager.addNoteEnd(noteKey);
          } else if (
            learnMode.lesson.phase === "your_turn" &&
            learnMode.lessonMode === "evaluation"
          ) {
            // Lesson mode: Only record in evaluation mode
            learnRecordingManager.addNoteEnd(noteKey);
          }
        } else if (learnModeType === "free-practice") {
          // Always record for free practice
          freePracticeRecordingManager.addNoteEnd(noteKey);
        }
      }
    },
    [
      activeMode,
      recordingManager,
      learnRecordingManager,
      freePracticeRecordingManager,
      learnMode.lesson.phase,
      learnMode.lessonMode,
      learnModeType,
      isInTuneMode,
    ],
  );

  // Automatic AI reply handling
  async function handleImprovPlay(userSequence: NoteSequence) {
    const requestId = crypto.randomUUID();
    currentRequestIdRef.current = requestId;
    requestStartTimeRef.current = Date.now();

    setAppState("waiting_for_ai");

    try {
      let aiSequence: NoteSequence | null = null;

      if (magenta.isMagentaModel(selectedModel)) {
        // Normalize creativity (0-100) to model-specific temperature
        const creativity = magentaTemperature ?? 40;
        const modelName = selectedModel === "magenta/music-rnn" ? "RNN" : "VAE";
        console.log(
          `[Creativity] Using creativity ${creativity} for model: ${modelName}`,
        );
        const temperature =
          selectedModel === "magenta/music-rnn"
            ? normalizeCreativityToRNN(creativity)
            : normalizeCreativityToVAE(creativity);

        aiSequence = await magenta.continueSequence(
          userSequence,
          selectedModel as MagentaModelType,
          metronomeBpm,
          metronomeTimeSignature,
          { temperature },
        );

        if (currentRequestIdRef.current !== requestId) return;
        if (!aiSequence)
          throw new Error("Magenta failed to generate a response");
      } else {
        const { data, error } = await supabase.functions.invoke("improvise", {
          body: {
            userSequence,
            model: selectedModel,
            metronome: {
              bpm: metronomeBpm,
              timeSignature: metronomeTimeSignature,
              isActive: metronomeIsPlaying,
            },
            instrument: pianoSoundType,
          },
        });

        if (currentRequestIdRef.current !== requestId) return;
        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data.sequence?.notes?.length > 0) {
          aiSequence = data.sequence as NoteSequence;
        }
      }

      if (currentRequestIdRef.current !== requestId) return;

      if (aiSequence?.notes?.length > 0) {
        const elapsed = Date.now() - requestStartTimeRef.current;
        if (elapsed < MIN_WAIT_TIME_MS) {
          await new Promise((resolve) =>
            setTimeout(resolve, MIN_WAIT_TIME_MS - elapsed),
          );
        }

        if (currentRequestIdRef.current !== requestId) return;

        // Add AI response as a separate entry
        playModeRef.current?.addEntry(aiSequence, true);
        recordingManager.hideProgress();
        await playSequence(aiSequence, requestId);
      } else {
        setAppState("idle");
        recordingManager.hideProgress();
      }
    } catch (error) {
      console.error("Error getting AI response:", error);
      if (currentRequestIdRef.current === requestId) {
        toast({
          title: "Error",
          description:
            error instanceof Error
              ? error.message
              : "Failed to get AI response",
          variant: "destructive",
        });
        setAppState("idle");
        recordingManager.hideProgress();
      }
    }
  }

  // Manual AI request helper (Magenta only for now as per previous implementation)
  async function handleManualAiRequest(
    userSequence: NoteSequence,
    modelType: MagentaModelType,
    requestLabel: string,
  ) {
    const requestId = crypto.randomUUID();
    currentRequestIdRef.current = requestId;
    requestStartTimeRef.current = Date.now();

    setAppState("waiting_for_ai");
    setGenerationLabel(
      modelType === "magenta/music-rnn" ? "Improvising..." : "Arranging...",
    );

    try {
      // Normalize creativity (0-100) to model-specific temperature
      const creativity = magentaTemperature ?? 40;
      const modelName = modelType === "magenta/music-rnn" ? "RNN" : "VAE";
      console.log(
        `[Creativity] Manual request - Using creativity ${creativity} for model: ${modelName}`,
      );
      const temperature =
        modelType === "magenta/music-rnn"
          ? normalizeCreativityToRNN(creativity)
          : normalizeCreativityToVAE(creativity);

      const aiSequence = await magenta.continueSequence(
        userSequence,
        modelType,
        metronomeBpm,
        metronomeTimeSignature,
        { temperature },
      );

      if (currentRequestIdRef.current !== requestId) return;
      if (!aiSequence) throw new Error("Magenta failed to generate a response");

      const elapsed = Date.now() - requestStartTimeRef.current;
      if (elapsed < MIN_WAIT_TIME_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_WAIT_TIME_MS - elapsed),
        );
      }

      if (currentRequestIdRef.current !== requestId) return;

      playModeRef.current?.addEntry(aiSequence, true);
      setGenerationLabel(null);
      await playSequence(aiSequence, requestId);
    } catch (error) {
      console.error(`[Manual AI] Failed to ${requestLabel}:`, error);
      toast({
        title: `Failed to ${requestLabel}`,
        description:
          error instanceof Error ? error.message : "Unable to generate music",
        variant: "destructive",
      });
      setAppState("idle");
      setGenerationLabel(null);
    }
  }

  // Note: handleAskSubmit is now unused as learn mode handles its own AI calls
  // Keeping for potential future use in other modes

  const clearCurrentHistory = () => {
    if (activeMode === "play") playMode.clearHistory();
    // Learn mode doesn't have a history to clear in the same way
  };

  const hasHistory = activeMode === "play" && playMode.history.length > 0;

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-background">
      <Tabs
        value={activeMode}
        onValueChange={(v) => handleModeChange(v as ActiveMode)}
        className="w-full flex-1 flex flex-col"
      >
        <div className="sticky top-0 z-30 w-full bg-background">
          <div className="flex items-center justify-between p-2">
            <div className="flex items-center gap-2">
              <UserMenu
                language={language}
                onLanguageChange={setLanguage}
                notationPreference={musicNotation}
                onNotationChange={setMusicNotation}
              />
              <TabsList>
                <TabsTrigger value="play">{t("tabs.play")}</TabsTrigger>
                <TabsTrigger value="learn">{t("tabs.learn")}</TabsTrigger>
                <TabsTrigger value="quest">{t("tabs.quest")}</TabsTrigger>
                <TabsTrigger value="lab">{t("tabs.lab")}</TabsTrigger>
              </TabsList>
              {activeMode === "quest" && questHeaderTitle && (
                <span className="text-sm text-muted-foreground ml-2">
                  {questHeaderTitle}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {activeMode === "play" && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="autoreply-mode"
                    checked={isAutoreplyActive}
                    onCheckedChange={setIsAutoreplyActive}
                    disabled={
                      appState !== "idle" && appState !== "user_playing"
                    }
                  />
                  <Label htmlFor="autoreply-mode" className="cursor-pointer">
                    {t("controls.autoreply")}
                  </Label>
                </div>
              )}

              {activeMode === "play" && isAutoreplyActive && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="justify-between"
                    >
                      {AI_MODELS.llm.find((m) => m.value === selectedModel)
                        ?.label ||
                        AI_MODELS.magenta.find((m) => m.value === selectedModel)
                          ?.label ||
                        selectedModel}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {AI_MODELS.llm.map((model) => (
                      <DropdownMenuItem
                        key={model.value}
                        onClick={() => setSelectedModel(model.value)}
                      >
                        {model.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Magenta</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {AI_MODELS.magenta.map((model) => (
                          <DropdownMenuItem
                            key={model.value}
                            onClick={() => setSelectedModel(model.value)}
                          >
                            {model.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {activeMode === "play" &&
                isAutoreplyActive &&
                magenta.isMagentaModel(selectedModel) && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        Creativity: {magentaTemperature}%
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-80">
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium text-sm mb-1">
                            Creativity
                          </h4>
                          <p className="text-xs text-muted-foreground">
                            0 = predictable, 100 = surprising
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Slider
                            value={[magentaTemperature]}
                            onValueChange={(values) => {
                              const newValue = values[0];
                              console.log(
                                `[Creativity] Slider changed to: ${newValue}`,
                              );
                              setMagentaTemperature(newValue);
                              // Verify it was saved
                              setTimeout(() => {
                                const saved = window.localStorage.getItem(
                                  STORAGE_KEYS.MAGENTA_TEMPERATURE,
                                );
                                console.log(
                                  `[Creativity] Saved to localStorage: ${saved}`,
                                );
                              }, 0);
                            }}
                            min={0}
                            max={100}
                            step={1}
                            className="w-full"
                          />
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>0</span>
                            <span className="font-medium">
                              {magentaTemperature}
                            </span>
                            <span>100</span>
                          </div>
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                )}
            </div>
            <div className="flex items-center gap-2">
              {activeMode === "quest" && questHeaderActions}
              {activeMode === "learn" && (
                <>
                  {activeMode === "learn" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="justify-between"
                        >
                          {AI_MODELS.llm.find((m) => m.value === selectedModel)
                            ?.label || selectedModel}
                          <ChevronDown className="h-4 w-4 opacity-50" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        {AI_MODELS.llm.map((model) => (
                          <DropdownMenuItem
                            key={model.value}
                            onClick={() => setSelectedModel(model.value)}
                          >
                            {model.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <div className="flex items-center gap-2 ml-auto">
                    <Label
                      htmlFor="debug-mode"
                      className="cursor-pointer text-sm text-muted-foreground"
                    >
                      Debug
                    </Label>
                    <Switch
                      id="debug-mode"
                      checked={debugMode}
                      onCheckedChange={(checked) =>
                        setDebugMode(checked === true)
                      }
                    />
                  </div>
                  {debugMode && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setLearnModeType("free-practice");
                        }}
                      >
                        {t("learnMode.freePractice", "Free Practice")}
                      </Button>
                    </>
                  )}
                </>
              )}
              {/* Play/Stop - only shown when there's history */}
              {activeMode === "play" && playMode.history.length > 0 && (
                <Button
                  onClick={() => {
                    if (playMode.isPlaying) {
                      playMode.onStopPlayback();
                    } else {
                      const seq = playMode.getCombinedSequence();
                      if (seq?.sequence) {
                        playMode.onPlayAll(seq.sequence, seq.segments);
                      }
                    }
                  }}
                  variant="outline"
                  size="sm"
                >
                  {playMode.isPlaying ? (
                    <Square className="h-4 w-4" fill="currentColor" />
                  ) : (
                    <Play className="h-4 w-4" fill="currentColor" />
                  )}
                  {playMode.isPlayingAll
                    ? t("controls.stop")
                    : t("controls.play")}
                </Button>
              )}
              {activeMode === "play" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {/* Insert submenu */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <FilePlus className="h-4 w-4 mr-2" />
                        {t("menus.insert")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem onClick={handleUploadAbc}>
                          <Upload className="h-4 w-4 mr-2" />
                          {t("menus.uploadAbc")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={handleUploadMusicXml}
                          disabled={isMusicXmlImporting}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          {t("menus.uploadMusicXml")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleUploadMidi}>
                          <Upload className="h-4 w-4 mr-2" />
                          {t("menus.uploadMidi")}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleUploadNoteSequence}>
                          <Upload className="h-4 w-4 mr-2" />
                          {t("menus.uploadNoteSequence")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setPartitionDialogOpen(true)}
                        >
                          <PencilLine className="h-4 w-4 mr-2" />
                          {t("menus.writeAbc")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setWhistleSheetOpen(true)}
                        >
                          <Mic className="h-4 w-4 mr-2" />
                          {t("menus.whistleImport")}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setNoteSequenceDialogOpen(true)}
                        >
                          <Music className="h-4 w-4 mr-2" />
                          {t("menus.writeNoteSequence")}
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    {/* New */}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem
                          onSelect={(e) => e.preventDefault()}
                          disabled={playMode.history.length === 0}
                        >
                          <FilePlus className="h-4 w-4 mr-2" />
                          {t("menus.new")}
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            {t("menus.startNewTitle")}
                          </AlertDialogTitle>
                          <AlertDialogDescription>
                            {t("menus.startNewDescription")}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>
                            {t("menus.cancel")}
                          </AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => {
                              playMode.clearHistory();
                              compositions.clearCurrentComposition();
                            }}
                          >
                            {t("menus.new")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>

                    {/* Save */}
                    <DropdownMenuItem
                      onClick={() => {
                        if (
                          compositions.currentComposition &&
                          playMode.history.length > 0
                        ) {
                          compositions.updateComposition(
                            compositions.currentComposition.id,
                            playMode.history,
                            pianoSoundType,
                            metronomeBpm,
                            metronomeTimeSignature,
                          );
                        } else if (playMode.history.length > 0) {
                          setSaveModalMode("save");
                          setSaveModalOpen(true);
                        }
                      }}
                      disabled={
                        playMode.history.length === 0 || compositions.isLoading
                      }
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {t("menus.save")}
                    </DropdownMenuItem>

                    {/* Save as */}
                    <DropdownMenuItem
                      onClick={() => {
                        setSaveModalMode("saveAs");
                        setSaveModalOpen(true);
                      }}
                      disabled={playMode.history.length === 0}
                    >
                      <Save className="h-4 w-4 mr-2" />
                      {t("menus.saveAs")}
                    </DropdownMenuItem>

                    <DropdownMenuSeparator />

                    {/* Export submenu */}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger
                        disabled={playMode.history.length === 0}
                      >
                        <Download className="h-4 w-4 mr-2" />
                        {t("menus.export")}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuItem
                          onClick={async () => {
                            const seq = playMode.getCombinedSequence();
                            if (seq?.sequence) {
                              await navigator.clipboard.writeText(
                                JSON.stringify(seq.sequence, null, 2),
                              );
                              toast({ title: "Copied as NoteSequence" });
                            }
                          }}
                        >
                          Note Sequence
                        </DropdownMenuItem>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>

                    <DropdownMenuSeparator />

                    {/* Open submenu */}
                    <CompositionSubmenu
                      compositions={compositions.compositions}
                      onSelect={(composition) => {
                        if (playMode.history.length > 0) {
                          setPendingCompositionToLoad(composition);
                          setSaveBeforeOpenDialogOpen(true);
                        } else {
                          loadCompositionWithToast(composition);
                        }
                      }}
                      isLoading={compositions.isLoading}
                    />

                    {/* Delete - only when composition loaded */}
                    {compositions.currentComposition && (
                      <>
                        <DropdownMenuSeparator />
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                Delete composition?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently delete "
                                {compositions.currentComposition?.title}" from
                                the cloud. This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => {
                                  if (compositions.currentComposition) {
                                    compositions.deleteComposition(
                                      compositions.currentComposition.id,
                                    );
                                  }
                                }}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
        </div>

        <div
          id="topContainer"
          className="w-full flex flex-col items-stretch justify-start relative flex-1"
        >
          {/* AI Playing / Replay indicator */}
          <TopToastLabel
            show={appState === "ai_playing"}
            label={isReplaying ? t("status.replay") : t("status.playing")}
            pulse
          />

          {/* Generation toast (Free and Duo modes) */}
          {generationLabel && (
            <TopToastLabel show={true} label={generationLabel} pulse />
          )}

          {/* Recording ending progress toast (play mode) */}
          {activeMode === "play" && (
            <TopToastProgress
              show={recordingManager.showEndingProgress}
              progress={recordingManager.endingProgress}
            />
          )}

          {/* AI preparing progress (play mode with autoreply) */}
          {activeMode === "play" && isAutoreplyActive && (
            <TopToastProgress
              show={recordingManager.showProgress}
              progress={recordingManager.progress}
              label={t("status.improvising")}
            />
          )}

          <TabsContent
            value="play"
            className="w-full h-full flex-1 min-h-0 flex items-center justify-center"
          >
            {playMode.render()}
          </TabsContent>
          <TabsContent
            value="learn"
            className="w-full h-full flex-1 min-h-0 flex items-center justify-center"
          >
            {learnModeType === "free-practice" ? (
              <FreePracticeMode {...freePracticeModeProps} />
            ) : (
              learnMode.render()
            )}
          </TabsContent>
          <TabsContent
            value="quest"
            className="w-full h-full flex-1 min-h-0 flex items-stretch justify-center"
          >
            <QuestEditor
              mode="embedded"
              isActive={activeMode === "quest"}
              onHeaderActionsChange={setQuestHeaderActions}
              onHeaderTitleChange={setQuestHeaderTitle}
            />
          </TabsContent>
          <TabsContent
            value="lab"
            className="w-full h-full flex-1 min-h-0 flex items-center justify-center"
          >
            <LabMode
              onPlaySequence={handleLabPlaySequence}
              onStopPlayback={stopAiPlayback}
              isPlaying={isPlaying}
              onRegisterNoteHandler={registerLabNoteHandler}
            />
          </TabsContent>
        </div>
      </Tabs>

      {activeMode !== "quest" && (
        <div className="w-full h-[380px] z-30 bg-background border-t rounded-t-2xl flex flex-col">
          {/* Piano Sound Selector & Metronome (left) | MIDI Connector (right) */}
          <div className="w-full flex items-center justify-between gap-4 px-2 py-0 shrink-0">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <span>{PIANO_SOUND_LABELS[pianoSoundType]}</span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56 bg-popover">
                  <DropdownMenuLabel>{t("piano.sound")}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={pianoSoundType}
                    onValueChange={(v) =>
                      setPianoSoundType(v as PianoSoundType)
                    }
                  >
                    <DropdownMenuRadioItem value="classic">
                      {t("piano.basic")}
                    </DropdownMenuRadioItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {t("piano.sampledInstruments")}
                    </DropdownMenuLabel>
                    {SAMPLED_INSTRUMENTS.map((instrument) => (
                      <DropdownMenuRadioItem
                        key={instrument}
                        value={instrument}
                      >
                        {PIANO_SOUND_LABELS[instrument]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <Metronome
                bpm={metronomeBpm}
                setBpm={setMetronomeBpm}
                timeSignature={metronomeTimeSignature}
                setTimeSignature={setMetronomeTimeSignature}
                isPlaying={metronomeIsPlaying}
                setIsPlaying={setMetronomeIsPlaying}
                feel={activeMode === "learn" ? metronomeFeel : undefined}
                onFeelChange={
                  activeMode === "learn" ? setMetronomeFeel : undefined
                }
                onMetronomeStartTimeChange={
                  activeMode === "learn" ? setMetronomeStartTime : undefined
                }
                soundType={
                  activeMode === "learn" ? metronomeSoundType : undefined
                }
                onSoundTypeChange={
                  activeMode === "learn" ? setMetronomeSoundType : undefined
                }
              />
            </div>

            <MidiConnector
              isConnected={!!connectedDevice}
              deviceName={connectedDevice?.name || null}
              isSupported={isMidiSupported}
              onConnect={requestAccess}
              onDisconnect={disconnect}
            />
          </div>

          <Piano
            className="flex-1 min-h-0"
            ref={pianoRef}
            activeKeys={activeKeys}
            allowInput={
              appState === "idle" ||
              appState === "user_playing" ||
              appState === "waiting_for_ai"
            }
            soundType={pianoSoundType}
            hasColor={isInTuneMode || activeMode === "lab"}
            language={language}
            notationPreference={musicNotation}
            onNoteStart={handleNoteStart}
            onNoteEnd={handleNoteEnd}
          />
        </div>
      )}

      {/* Add/Edit Partition Sheet */}
      <AddPartitionDialog
        open={partitionDialogOpen}
        onOpenChange={(open) => {
          setPartitionDialogOpen(open);
          if (!open) {
            setEditingEntryIndex(null);
            setEditDialogMode("add");
          }
        }}
        onAdd={(sequence) => {
          if (activeMode === "play") {
            playModeRef.current?.addEntry(sequence, false);
          }
        }}
        onEdit={(sequence) => {
          if (activeMode === "play" && editingEntryIndex !== null) {
            playModeRef.current?.updateEntry(editingEntryIndex, sequence);
          }
        }}
        bpm={metronomeBpm}
        mode={editDialogMode}
        initialAbc={
          editDialogMode === "edit" &&
          editingEntryIndex !== null &&
          playMode.history[editingEntryIndex]
            ? noteSequenceToAbc(playMode.history[editingEntryIndex].sequence)
            : undefined
        }
        instrument={pianoSoundType}
      />

      {/* Add/Edit NoteSequence Dialog */}
      <AddNoteSequenceDialog
        open={noteSequenceDialogOpen}
        onOpenChange={(open) => {
          setNoteSequenceDialogOpen(open);
          if (!open) {
            setNoteSequenceEditIndex(null);
            setNoteSequenceEditMode("add");
          }
        }}
        onAdd={(sequence) => {
          if (activeMode === "play") {
            playModeRef.current?.addEntry(sequence, false);
          }
        }}
        onEdit={(sequence) => {
          if (activeMode === "play" && noteSequenceEditIndex !== null) {
            playModeRef.current?.updateEntry(noteSequenceEditIndex, sequence);
          }
        }}
        mode={noteSequenceEditMode}
        initialSequence={
          noteSequenceEditMode === "edit" &&
          noteSequenceEditIndex !== null &&
          playMode.history[noteSequenceEditIndex]
            ? playMode.history[noteSequenceEditIndex].sequence
            : undefined
        }
      />

      <WhistleImportSheet
        open={whistleSheetOpen}
        onOpenChange={setWhistleSheetOpen}
        bpm={metronomeBpm}
        timeSignature={metronomeTimeSignature}
        onSave={(sequence) => {
          if (activeMode === "play") {
            playModeRef.current?.addEntry(sequence, false);
          }
        }}
      />

      {/* Save before opening another composition */}
      <AlertDialog
        open={saveBeforeOpenDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setPendingCompositionToLoad(null);
          }
          setSaveBeforeOpenDialogOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("menus.saveBeforeOpeningTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {compositions.currentComposition
                ? t("menus.saveBeforeOpeningDescriptionExisting")
                : t("menus.saveBeforeOpeningDescriptionNew")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="sm:flex-row sm:justify-end sm:space-x-2">
            <AlertDialogCancel
              onClick={() => setPendingCompositionToLoad(null)}
            >
              {t("menus.cancel")}
            </AlertDialogCancel>
            <Button
              variant="outline"
              onClick={handleContinueWithoutSaving}
              disabled={compositions.isLoading}
            >
              {t("menus.continueWithoutSaving")}
            </Button>
            {compositions.currentComposition ? (
              <AlertDialogAction
                onClick={handleSaveAndLoadExisting}
                disabled={compositions.isLoading}
              >
                {t("menus.saveAndOpen")}
              </AlertDialogAction>
            ) : (
              <AlertDialogAction
                onClick={handleSaveAsNewBeforeLoad}
                disabled={compositions.isLoading}
              >
                {t("menus.saveAsNewAndOpen")}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Save Composition Modal */}
      <SaveCompositionModal
        open={saveModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            setLoadPendingAfterSave(false);
          }
          setSaveModalOpen(open);
        }}
        onSave={async (title) => {
          let savedComposition: Composition | null = null;
          if (saveModalMode === "saveAs" || !compositions.currentComposition) {
            savedComposition = await compositions.saveComposition(
              title,
              playMode.history,
              pianoSoundType,
              metronomeBpm,
              metronomeTimeSignature,
            );
          }
          setSaveModalOpen(false);
          if (
            loadPendingAfterSave &&
            pendingCompositionToLoad &&
            savedComposition
          ) {
            loadCompositionWithToast(pendingCompositionToLoad);
          }
          setLoadPendingAfterSave(false);
        }}
        isLoading={compositions.isLoading}
        defaultTitle={compositions.currentComposition?.title || ""}
      />
    </div>
  );
};

export default Index;
