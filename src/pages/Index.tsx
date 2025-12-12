import { useState, useRef, useCallback } from "react";
import Piano, { PianoHandle } from "@/components/Piano";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Trash2,
  Brain,
  ChevronDown,
  Loader2,
  PencilLine,
  Play,
  Square,
  Sparkles,
  MoreHorizontal,
  Copy,
  Music,
  FileMusic,
  Save,
  FilePlus,
  Download,
} from "lucide-react";
import { PianoSoundType, PIANO_SOUND_LABELS, SAMPLED_INSTRUMENTS } from "@/hooks/usePianoSound";
import { MidiConnector } from "@/components/MidiConnector";
import { useMidiInput } from "@/hooks/useMidiInput";
import { Metronome } from "@/components/Metronome";
import { NoteSequence, Note, PlaybackSegment } from "@/types/noteSequence";
import { midiToFrequency, midiToNoteName, noteSequenceToAbc } from "@/utils/noteSequenceUtils";
import { AddPartitionDialog } from "@/components/AddPartitionDialog";
import { useMagenta, MagentaModelType } from "@/hooks/useMagenta";
import { useRecordingManager, RecordingResult } from "@/hooks/useRecordingManager";
import { TopToastProgress, TopToastLabel } from "@/components/TopToast";
import { PlayMode, PlayEntry } from "@/components/modes/PlayMode";
import { LearnMode } from "@/components/modes/LearnMode";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
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
import { useCompositions } from "@/hooks/useCompositions";
import { SaveCompositionModal } from "@/components/SaveCompositionModal";
import { CompositionSubmenu } from "@/components/CompositionSubmenu";

const AI_MODELS = {
  llm: [
    { value: "google/gemini-2.5-flash", label: "Gemini Flash" },
    { value: "google/gemini-2.5-pro", label: "Gemini Pro" },
    { value: "openai/gpt-5", label: "GPT-5" },
  ],
  magenta: [
    { value: "magenta/music-rnn", label: "MusicRNN", description: "Jazz improvisation" },
    { value: "magenta/music-vae", label: "MusicVAE", description: "Variation sampling" },
  ],
} as const;

type AppState = "idle" | "user_playing" | "waiting_for_ai" | "ai_playing";
type ActiveMode = "play" | "learn";

const Index = () => {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [appState, setAppState] = useState<AppState>("idle");
  const [activeMode, setActiveMode] = useLocalStorage<ActiveMode>(STORAGE_KEYS.ACTIVE_MODE, "play");
  const [isAutoreplyActive, setIsAutoreplyActive] = useLocalStorage<boolean>(STORAGE_KEYS.AUTOREPLY, false);
  const [selectedModel, setSelectedModel] = useLocalStorage(STORAGE_KEYS.AI_MODEL, "magenta/music-rnn");
  const [isAskLoading, setIsAskLoading] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [liveNotes, setLiveNotes] = useState<Note[]>([]);
  const [generationLabel, setGenerationLabel] = useState<string | null>(null);
  const [partitionDialogOpen, setPartitionDialogOpen] = useState(false);
  const [editingEntryIndex, setEditingEntryIndex] = useState<number | null>(null);
  const [editDialogMode, setEditDialogMode] = useState<"add" | "edit">("add");
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [saveModalMode, setSaveModalMode] = useState<"save" | "saveAs">("save");

  // Persisted preferences
  const [pianoSoundType, setPianoSoundType] = useLocalStorage<PianoSoundType>(STORAGE_KEYS.INSTRUMENT, "classic");
  const [metronomeBpm, setMetronomeBpm] = useLocalStorage(STORAGE_KEYS.BPM, 120);
  const [metronomeTimeSignature, setMetronomeTimeSignature] = useLocalStorage(STORAGE_KEYS.TIME_SIGNATURE, "4/4");
  const [metronomeIsPlaying, setMetronomeIsPlaying] = useState(false);

  // Persisted history
  const [savedPlayHistory, setSavedPlayHistory] = useLocalStorage<PlayEntry[]>(STORAGE_KEYS.PLAY_HISTORY, []);

  const { toast } = useToast();
  const magenta = useMagenta();

  // Compositions hook for cloud save/load
  const handleCompositionLoad = useCallback(
    (composition: {
      data: PlayEntry[];
      instrument: string | null;
      bpm: number | null;
      time_signature: string | null;
    }) => {
      setSavedPlayHistory(composition.data);
      if (composition.instrument) setPianoSoundType(composition.instrument as PianoSoundType);
      if (composition.bpm) setMetronomeBpm(composition.bpm);
      if (composition.time_signature) setMetronomeTimeSignature(composition.time_signature);
    },
    [setSavedPlayHistory, setPianoSoundType, setMetronomeBpm, setMetronomeTimeSignature],
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

  const MIN_WAIT_TIME_MS = 1000;

  // Mode hooks defined later due to dependency on playSequence/handleReplaySequence
  // (they will be initialized after those functions are defined)

  const [playingSequence, setPlayingSequence] = useState<NoteSequence | null>(null);

  // Refs for circular dependency handling
  const handleReplaySequenceRef = useRef<(sequence: NoteSequence) => void>();
  const playModeRef = useRef<ReturnType<typeof PlayMode>>();
  const handlePlayAllSequencesRef = useRef<(combinedSequence: NoteSequence, segments?: PlaybackSegment[]) => void>();
  const learnMode = LearnMode({
    isLoading: isAskLoading,
    isPlaying: appState === "ai_playing",
    onSubmit: handleAskSubmit,
    onReplay: (seq) => handleReplaySequenceRef.current?.(seq),
    onClearHistory: () => toast({ title: "History cleared" }),
  });

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

  // MIDI note handlers
  const handleMidiNoteOn = (noteKey: string, frequency: number, velocity: number) => {
    if ((appState !== "idle" && appState !== "user_playing") || midiPressedKeysRef.current.has(noteKey)) return;
    midiPressedKeysRef.current.add(noteKey);
    pianoRef.current?.handleKeyPress(noteKey, frequency, velocity);
  };

  const handleMidiNoteOff = (noteKey: string, frequency: number) => {
    if (!midiPressedKeysRef.current.has(noteKey)) return;
    midiPressedKeysRef.current.delete(noteKey);
    pianoRef.current?.handleKeyRelease(noteKey, frequency);
  };

  const handleNoMidiDevices = () => {
    toast({
      title: "No MIDI devices found",
      description: "Please connect a MIDI device and try again.",
      variant: "destructive",
    });
  };

  const {
    connectedDevice,
    error: midiError,
    isSupported: isMidiSupported,
    requestAccess,
    disconnect,
  } = useMidiInput(handleMidiNoteOn, handleMidiNoteOff, handleNoMidiDevices);

  const stopAiPlayback = useCallback(() => {
    shouldStopAiRef.current = true;
    isPlayingRef.current = false;
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
    async (sequence: NoteSequence, requestId?: string, isReplay: boolean = false, segments?: PlaybackSegment[]) => {
      setIsReplaying(isReplay);
      const playbackId = Math.random().toString(36).substring(7);

      if (!isReplay && requestId && currentRequestIdRef.current !== requestId) {
        console.log(`[Playback ${playbackId}] Request invalidated`);
        return;
      }

      if (isPlayingRef.current) {
        console.log(`[Playback ${playbackId}] Already playing, stopping previous`);
      }

      // Normalize times so first note starts at 0
      const minStartTime = sequence.notes.length > 0 ? Math.min(...sequence.notes.map((n) => n.startTime)) : 0;
      const normalizedNotes = sequence.notes.map((note) => ({
        ...note,
        startTime: note.startTime - minStartTime,
        endTime: note.endTime - minStartTime,
      }));
      const normalizedSequence = { ...sequence, notes: normalizedNotes, totalTime: sequence.totalTime - minStartTime };

      console.log(
        `[Playback ${playbackId}] Starting: ${normalizedSequence.notes.length} notes, ${normalizedSequence.totalTime.toFixed(3)}s`,
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

          const segmentStartTime = Math.max(0, segment.startTime - minStartTime);
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
              setPlayingSequence((prev) => (prev === segment.originalSequence ? null : prev));
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
          console.log(`[Playback ${playbackId}] Complete: ${elapsed.toFixed(3)}s`);
          setAppState("idle");
          setPlayingSequence(null);
          setActiveKeys(new Set());
          setIsPlayingAll(false);
          noteTimeoutsRef.current = [];
          isPlayingRef.current = false;
        }
      }, normalizedSequence.totalTime * 1000);
    },
    [],
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
      setTimeout(() => playSequence(combinedSequence, undefined, true, segments), 50);
    },
    [playSequence],
  );

  // Handle edit entry request
  const handleEditEntry = useCallback((index: number, _sequence: NoteSequence) => {
    setEditingEntryIndex(index);
    setEditDialogMode("edit");
    setPartitionDialogOpen(true);
  }, []);

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
    isPlayingAll,
    initialHistory: savedPlayHistory,
    onHistoryChange: setSavedPlayHistory,
    onRequestImprov: (sequence) => handleManualAiRequest(sequence, "magenta/music-rnn", "create an improv"),
    onRequestVariations: (sequence) => handleManualAiRequest(sequence, "magenta/music-vae", "create variations"),
    playingSequence,
    onEditEntry: handleEditEntry,
  });

  // Assign to refs for use in handleRecordingComplete
  playModeRef.current = playMode;

  // Handle note events from Piano
  const handleNoteStart = useCallback(
    (noteKey: string, frequency: number, velocity: number) => {
      if (appState === "ai_playing") {
        stopAiPlayback();
      }

      if (appState !== "user_playing") {
        currentRequestIdRef.current = null;
        recordingManager.hideProgress();
        setAppState("user_playing");
      }

      if (activeMode === "play") {
        recordingManager.addNoteStart(noteKey, velocity);
      }
    },
    [appState, activeMode, recordingManager, stopAiPlayback],
  );

  const handleNoteEnd = useCallback(
    (noteKey: string, frequency: number) => {
      if (activeMode === "play") {
        recordingManager.addNoteEnd(noteKey);
      }
    },
    [activeMode, recordingManager],
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
        aiSequence = await magenta.continueSequence(
          userSequence,
          selectedModel as MagentaModelType,
          metronomeBpm,
          metronomeTimeSignature,
        );

        if (currentRequestIdRef.current !== requestId) return;
        if (!aiSequence) throw new Error("Magenta failed to generate a response");
      } else {
        const { data, error } = await supabase.functions.invoke("improvise", {
          body: {
            userSequence,
            model: selectedModel,
            metronome: { bpm: metronomeBpm, timeSignature: metronomeTimeSignature, isActive: metronomeIsPlaying },
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
          await new Promise((resolve) => setTimeout(resolve, MIN_WAIT_TIME_MS - elapsed));
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
          description: error instanceof Error ? error.message : "Failed to get AI response",
          variant: "destructive",
        });
        setAppState("idle");
        recordingManager.hideProgress();
      }
    }
  }

  // Manual AI request helper (Magenta only for now as per previous implementation)
  async function handleManualAiRequest(userSequence: NoteSequence, modelType: MagentaModelType, requestLabel: string) {
    const requestId = crypto.randomUUID();
    currentRequestIdRef.current = requestId;
    requestStartTimeRef.current = Date.now();

    setAppState("waiting_for_ai");
    setGenerationLabel(modelType === "magenta/music-rnn" ? "Improvising..." : "Arranging...");

    try {
      const aiSequence = await magenta.continueSequence(userSequence, modelType, metronomeBpm, metronomeTimeSignature);

      if (currentRequestIdRef.current !== requestId) return;
      if (!aiSequence) throw new Error("Magenta failed to generate a response");

      const elapsed = Date.now() - requestStartTimeRef.current;
      if (elapsed < MIN_WAIT_TIME_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_WAIT_TIME_MS - elapsed));
      }

      if (currentRequestIdRef.current !== requestId) return;

      playModeRef.current?.addEntry(aiSequence, true);
      setGenerationLabel(null);
      await playSequence(aiSequence, requestId);
    } catch (error) {
      console.error(`[Manual AI] Failed to ${requestLabel}:`, error);
      toast({
        title: `Failed to ${requestLabel}`,
        description: error instanceof Error ? error.message : "Unable to generate music",
        variant: "destructive",
      });
      setAppState("idle");
      setGenerationLabel(null);
    }
  }

  // Player mode AI handling
  async function handleAskSubmit(prompt: string) {
    stopAiPlayback();
    await pianoRef.current?.ensureAudioReady();
    setAppState("waiting_for_ai");
    setIsAskLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("piano-ask", {
        body: { prompt, model: selectedModel },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.sequence?.notes?.length > 0) {
        const aiSequence = data.sequence as NoteSequence;
        learnMode.addSession(prompt, aiSequence);
        await playSequence(aiSequence, undefined, true);
        toast({ title: "AI composed something!", description: `Playing: "${prompt}"` });
      } else {
        setAppState("idle");
      }
    } catch (error) {
      console.error("Error getting AI composition:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI composition",
        variant: "destructive",
      });
      setAppState("idle");
    } finally {
      setIsAskLoading(false);
    }
  }

  const clearCurrentHistory = () => {
    if (activeMode === "play") playMode.clearHistory();
    else if (activeMode === "learn") learnMode.clearHistory();
  };

  const hasHistory =
    (activeMode === "play" && playMode.history.length > 0) || (activeMode === "learn" && learnMode.history.length > 0);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start bg-background">
      <div id="topContainer" className="w-full flex flex-col items-center justify-start relative">
        {/* AI Playing / Replay indicator */}
        <TopToastLabel show={appState === "ai_playing"} label={isReplaying ? "Replay" : "Playing"} pulse />

        {/* Generation toast (Free and Duo modes) */}
        {generationLabel && <TopToastLabel show={true} label={generationLabel} pulse />}

        {/* Recording ending progress toast (play mode) */}
        {activeMode === "play" && (
          <TopToastProgress show={recordingManager.showEndingProgress} progress={recordingManager.endingProgress} />
        )}

        {/* AI preparing progress (play mode with autoreply) */}
        {activeMode === "play" && isAutoreplyActive && (
          <TopToastProgress
            show={recordingManager.showProgress}
            progress={recordingManager.progress}
            label="Improvising..."
          />
        )}

        {/* Piano Sound Selector & Metronome (left) | MIDI Connector (right) */}
        <div className="w-full flex items-center justify-between gap-4 p-2">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  <span>{PIANO_SOUND_LABELS[pianoSoundType]}</span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56 bg-popover">
                <DropdownMenuLabel>Piano Sound</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={pianoSoundType}
                  onValueChange={(v) => setPianoSoundType(v as PianoSoundType)}
                >
                  <DropdownMenuRadioItem value="classic">Basic</DropdownMenuRadioItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Sampled Instruments</DropdownMenuLabel>
                  {SAMPLED_INSTRUMENTS.map((instrument) => (
                    <DropdownMenuRadioItem key={instrument} value={instrument}>
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
            />
          </div>

          <MidiConnector
            isConnected={!!connectedDevice}
            deviceName={connectedDevice?.name || null}
            error={midiError}
            isSupported={isMidiSupported}
            onConnect={requestAccess}
            onDisconnect={disconnect}
          />
        </div>

        <Piano
          ref={pianoRef}
          activeKeys={activeKeys}
          allowInput={appState === "idle" || appState === "user_playing" || appState === "waiting_for_ai"}
          soundType={pianoSoundType}
          onNoteStart={handleNoteStart}
          onNoteEnd={handleNoteEnd}
        />

        <Tabs
          value={activeMode}
          onValueChange={(v) => handleModeChange(v as ActiveMode)}
          className="w-full relative z-10"
        >
          <div className="flex items-center justify-between px-2 py-4">
            <div className="flex items-center gap-6">
              <TabsList>
                <TabsTrigger value="play">Play</TabsTrigger>
                <TabsTrigger value="learn">Learn</TabsTrigger>
              </TabsList>
              {activeMode === "play" && (
                <div className="flex items-center gap-2">
                  <Switch
                    id="autoreply-mode"
                    checked={isAutoreplyActive}
                    onCheckedChange={setIsAutoreplyActive}
                    disabled={appState !== "idle" && appState !== "user_playing"}
                  />
                  <Label htmlFor="autoreply-mode" className="cursor-pointer">
                    Autoreply
                  </Label>
                </div>
              )}

              {activeMode === "learn" && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="justify-between">
                      {AI_MODELS.llm.find((m) => m.value === selectedModel)?.label || selectedModel}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {AI_MODELS.llm.map((model) => (
                      <DropdownMenuItem key={model.value} onClick={() => setSelectedModel(model.value)}>
                        {model.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {activeMode === "play" && isAutoreplyActive && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="justify-between">
                      {AI_MODELS.llm.find((m) => m.value === selectedModel)?.label ||
                        AI_MODELS.magenta.find((m) => m.value === selectedModel)?.label ||
                        selectedModel}
                      <ChevronDown className="h-4 w-4 opacity-50" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {AI_MODELS.llm.map((model) => (
                      <DropdownMenuItem key={model.value} onClick={() => setSelectedModel(model.value)}>
                        {model.label}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>Magenta</DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {AI_MODELS.magenta.map((model) => (
                          <DropdownMenuItem key={model.value} onClick={() => setSelectedModel(model.value)}>
                            {model.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* Play/Stop - only shown when there's history */}
              {playMode.history.length > 0 && (
                <Button
                  onClick={() => {
                    if (playMode.isPlayingAll) {
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
                  {playMode.isPlayingAll ? (
                    <Square className="h-4 w-4" fill="currentColor" />
                  ) : (
                    <Play className="h-4 w-4" fill="currentColor" />
                  )}
                  {playMode.isPlayingAll ? "Stop" : "Play"}
                </Button>
              )}

              {/* Add notes - standalone */}
              <Button variant="outline" size="sm" onClick={() => setPartitionDialogOpen(true)}>
                <PencilLine className="h-4 w-4" />
                Manual
              </Button>

              {/* Unified "..." menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  {/* New */}
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()} disabled={playMode.history.length === 0}>
                        <FilePlus className="h-4 w-4 mr-2" />
                        New
                      </DropdownMenuItem>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Start new composition?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will clear your current composition. Make sure to save first if you want to keep it.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => {
                            playMode.clearHistory();
                            compositions.clearCurrentComposition();
                          }}
                        >
                          New
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>

                  {/* Save */}
                  <DropdownMenuItem
                    onClick={() => {
                      if (compositions.currentComposition && playMode.history.length > 0) {
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
                    disabled={playMode.history.length === 0 || compositions.isLoading}
                  >
                    <Save className="h-4 w-4 mr-2" />
                    Save
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
                    Save as...
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />

                  {/* Export submenu */}
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger disabled={playMode.history.length === 0}>
                      <Download className="h-4 w-4 mr-2" />
                      Export
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent>
                      <DropdownMenuItem
                        onClick={async () => {
                          const seq = playMode.getCombinedSequence();
                          if (seq?.sequence) {
                            const title = compositions.currentComposition?.title || "Composition";
                            const abcContent = noteSequenceToAbc(seq.sequence, title);
                            
                            try {
                              if ('showSaveFilePicker' in window) {
                                const handle = await (window as any).showSaveFilePicker({
                                  suggestedName: `${title}.txt`,
                                  types: [{
                                    description: 'Text File',
                                    accept: { 'text/plain': ['.txt'] }
                                  }]
                                });
                                const writable = await handle.createWritable();
                                await writable.write(abcContent);
                                await writable.close();
                                toast({ title: "Exported as ABC file" });
                              } else {
                                // Fallback for browsers without File System Access API
                                const blob = new Blob([abcContent], { type: 'text/plain' });
                                const url = URL.createObjectURL(blob);
                                const link = document.createElement('a');
                                link.href = url;
                                link.download = `${title}.txt`;
                                document.body.appendChild(link);
                                link.click();
                                document.body.removeChild(link);
                                URL.revokeObjectURL(url);
                                toast({ title: "Exported as ABC file" });
                              }
                            } catch (err) {
                              // User cancelled the save dialog
                              if ((err as Error).name !== 'AbortError') {
                                toast({ title: "Export failed", variant: "destructive" });
                              }
                            }
                          }
                        }}
                      >
                        ABC
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={async () => {
                          const seq = playMode.getCombinedSequence();
                          if (seq?.sequence) {
                            await navigator.clipboard.writeText(JSON.stringify(seq.sequence, null, 2));
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
                      compositions.loadComposition(composition);
                      toast({ title: `Loaded "${composition.title}"` });
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
                            <AlertDialogTitle>Delete composition?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will permanently delete "{compositions.currentComposition?.title}" from the cloud.
                              This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => {
                                if (compositions.currentComposition) {
                                  compositions.deleteComposition(compositions.currentComposition.id);
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
            </div>
          </div>
          <TabsContent value="play" className="mt-0">
            {playMode.render()}
          </TabsContent>

          <TabsContent value="learn" className="mt-0">
            <Card className="border-none shadow-none bg-transparent">
              <CardContent className="p-0">
                <div className="mb-4 flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-blue-500/20 ring-4 ring-blue-500/10" />
                  <span className="text-sm text-muted-foreground">Ask AI for exercises or theory</span>
                </div>
                {learnMode.render()}
              </CardContent>
            </Card>
          </TabsContent>
          {/* The following lines seem to be a syntax error in the original document and are removed for correctness */}
          {/*                    ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  )
} */}
        </Tabs>
      </div>

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
          editDialogMode === "edit" && editingEntryIndex !== null && playMode.history[editingEntryIndex]
            ? noteSequenceToAbc(playMode.history[editingEntryIndex].sequence)
            : undefined
        }
        instrument={pianoSoundType}
      />

      {/* Save Composition Modal */}
      <SaveCompositionModal
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        onSave={async (title) => {
          if (saveModalMode === "saveAs" || !compositions.currentComposition) {
            await compositions.saveComposition(
              title,
              playMode.history,
              pianoSoundType,
              metronomeBpm,
              metronomeTimeSignature,
            );
          }
          setSaveModalOpen(false);
        }}
        isLoading={compositions.isLoading}
      />
    </div>
  );
};

export default Index;
