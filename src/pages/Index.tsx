import { useState, useRef, useCallback } from "react";
import Piano, { PianoHandle } from "@/components/Piano";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Trash2, Brain, ChevronDown, Loader2, Play, Square, Sparkles, MoreHorizontal, Copy } from "lucide-react";
import { MidiConnector } from "@/components/MidiConnector";
import { useMidiInput } from "@/hooks/useMidiInput";
import { Metronome } from "@/components/Metronome";
import { NoteSequence, Note } from "@/types/noteSequence";
import {
  midiToFrequency,
  midiToNoteName,
  noteNameToMidi,
  createEmptyNoteSequence,
  noteSequenceToAbc,
} from "@/utils/noteSequenceUtils";
import { useMagenta, MagentaModelType } from "@/hooks/useMagenta";
import { useRecordingManager, RecordingResult } from "@/hooks/useRecordingManager";
import { TopToastProgress, TopToastLabel } from "@/components/TopToast";
import { ComposeMode } from "@/components/modes/ComposeMode";
import { ImprovMode } from "@/components/modes/ImprovMode";
import { PlayerMode } from "@/components/modes/PlayerMode";

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
type ActiveMode = "compose" | "improv" | "player";

const Index = () => {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [appState, setAppState] = useState<AppState>("idle");
  const [activeMode, setActiveMode] = useState<ActiveMode>("compose");
  const [selectedModel, setSelectedModel] = useState("magenta/music-rnn");
  const [isAskLoading, setIsAskLoading] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [liveNotes, setLiveNotes] = useState<Note[]>([]);

  // Metronome state
  const [metronomeBpm, setMetronomeBpm] = useState(120);
  const [metronomeTimeSignature, setMetronomeTimeSignature] = useState("4/4");
  const [metronomeIsPlaying, setMetronomeIsPlaying] = useState(false);

  const { toast } = useToast();
  const magenta = useMagenta();
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

  // Refs for circular dependency handling
  const handleReplaySequenceRef = useRef<(sequence: NoteSequence) => void>();
  const composeModeRef = useRef<ReturnType<typeof ComposeMode>>();
  const improvModeRef = useRef<ReturnType<typeof ImprovMode>>();
  const handlePlayAllSequencesRef = useRef<(combinedSequence: NoteSequence) => void>();
  const playerMode = PlayerMode({
    isLoading: isAskLoading,
    isPlaying: appState === "ai_playing",
    onSubmit: handleAskSubmit,
    onReplay: (seq) => handleReplaySequenceRef.current?.(seq),
    onClearHistory: () => toast({ title: "History cleared" }),
  });

  // Recording manager for improv and compose modes
  const handleRecordingComplete = useCallback(
    (result: RecordingResult) => {
      setLiveNotes([]); // Clear live notes when recording completes
      if (activeMode === "improv") {
        // Add user recording immediately as a separate entry
        improvModeRef.current?.addEntry(result.sequence, false);
        handleImprovPlay(result.sequence);
      } else if (activeMode === "compose") {
        composeModeRef.current?.addUserSequence(result.sequence);
        setAppState("idle");
      }
    },
    [activeMode],
  );

  const handleRecordingUpdate = useCallback((notes: Note[]) => {
    setLiveNotes(notes);
  }, []);

  const recordingManager = useRecordingManager({
    bpm: metronomeBpm,
    timeSignature: metronomeTimeSignature,
    onRecordingComplete: handleRecordingComplete,
    onRecordingUpdate: handleRecordingUpdate,
    pauseTimeoutMs: activeMode === "improv" ? 2000 : 3000, // Duo uses 2s, Free uses 3s
    resumeGapMs: 1000,
  });

  const handleModeChange = (newMode: ActiveMode) => {
    if (newMode === "player" && magenta.isMagentaModel(selectedModel)) {
      setSelectedModel("google/gemini-2.5-flash");
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
    setIsPlayingAll(false);
  }, []);

  const playSequence = useCallback(async (sequence: NoteSequence, requestId?: string, isReplay: boolean = false) => {
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
        setActiveKeys(new Set());
        noteTimeoutsRef.current = [];
        isPlayingRef.current = false;
      }
    }, normalizedSequence.totalTime * 1000);
  }, []);

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
    (combinedSequence: NoteSequence) => {
      if (isPlayingRef.current) return;

      setIsPlayingAll(true);
      pianoRef.current?.ensureAudioReady();
      setTimeout(() => playSequence(combinedSequence, undefined, true), 50);
    },
    [playSequence],
  );

  // Compose mode hook - defined here since it needs handleReplaySequence and playSequence
  const composeMode = ComposeMode({
    bpm: metronomeBpm,
    timeSignature: metronomeTimeSignature,
    onReplay: handleReplaySequence,
    onPlayAll: handlePlayAllSequences,
    onStopPlayback: stopAiPlayback,
    onClearHistory: () => toast({ title: "History cleared" }),
    liveNotes,
    isRecording: appState === "user_playing" && activeMode === "compose",
    isPlayingAll,
  });

  // Improv mode hook - also uses track display now
  const improvMode = ImprovMode({
    bpm: metronomeBpm,
    timeSignature: metronomeTimeSignature,
    onReplay: handleReplaySequence,
    onPlayAll: handlePlayAllSequences,
    onStopPlayback: stopAiPlayback,
    onClearHistory: () => toast({ title: "History cleared" }),
    liveNotes,
    isRecording: appState === "user_playing" && activeMode === "improv",
    isPlayingAll,
  });

  // Assign to refs for use in handleRecordingComplete
  composeModeRef.current = composeMode;
  improvModeRef.current = improvMode;

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

      if (activeMode === "improv" || activeMode === "compose") {
        recordingManager.addNoteStart(noteKey, velocity);
      }
    },
    [appState, activeMode, recordingManager, stopAiPlayback],
  );

  const handleNoteEnd = useCallback(
    (noteKey: string, frequency: number) => {
      if (activeMode === "improv" || activeMode === "compose") {
        recordingManager.addNoteEnd(noteKey);
      }
    },
    [activeMode, recordingManager],
  );

  // Improv AI handling
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
        const { data, error } = await supabase.functions.invoke("jazz-improvise", {
          body: {
            userSequence,
            model: selectedModel,
            metronome: { bpm: metronomeBpm, timeSignature: metronomeTimeSignature, isActive: metronomeIsPlaying },
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
        improvMode.addEntry(aiSequence, true);
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
        playerMode.addSession(prompt, aiSequence);
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
    if (activeMode === "compose") composeMode.clearHistory();
    else if (activeMode === "improv") improvMode.clearHistory();
    else if (activeMode === "player") playerMode.clearHistory();
  };

  const hasHistory =
    (activeMode === "compose" && composeMode.history.length > 0) ||
    (activeMode === "improv" && improvMode.history.length > 0) ||
    (activeMode === "player" && playerMode.history.length > 0);

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4 bg-background gap-4 relative">
      {/* AI Playing / Replay indicator */}
      <TopToastLabel show={appState === "ai_playing"} label={isReplaying ? "Replay" : "Playing"} pulse />

      {/* Recording ending progress toast (compose mode) */}
      {activeMode === "compose" && (
        <TopToastProgress show={recordingManager.showEndingProgress} progress={recordingManager.endingProgress} />
      )}

      {/* AI preparing progress (improv mode) */}
      {activeMode === "improv" && (
        <TopToastProgress
          show={recordingManager.showProgress}
          progress={recordingManager.progress}
          label="AI preparing response..."
        />
      )}

      <Metronome
        bpm={metronomeBpm}
        setBpm={setMetronomeBpm}
        timeSignature={metronomeTimeSignature}
        setTimeSignature={setMetronomeTimeSignature}
        isPlaying={metronomeIsPlaying}
        setIsPlaying={setMetronomeIsPlaying}
      >
        <MidiConnector
          isConnected={!!connectedDevice}
          deviceName={connectedDevice?.name || null}
          error={midiError}
          isSupported={isMidiSupported}
          onConnect={requestAccess}
          onDisconnect={disconnect}
        />
      </Metronome>

      <Piano
        ref={pianoRef}
        activeKeys={activeKeys}
        allowInput={appState === "idle" || appState === "user_playing" || appState === "waiting_for_ai"}
        onNoteStart={handleNoteStart}
        onNoteEnd={handleNoteEnd}
      />

      <Tabs value={activeMode} onValueChange={(v) => handleModeChange(v as ActiveMode)} className="w-full">
        <div className="w-full flex flex-wrap items-center justify-between gap-4 py-2">
          <TabsList className="bg-muted">
            <TabsTrigger value="compose">
              <span>Free</span>
            </TabsTrigger>
            <TabsTrigger value="improv">
              <span>Duo</span>
            </TabsTrigger>
            <TabsTrigger value="player">
              <span>Teacher</span>
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2">
            {(activeMode === "improv" || activeMode === "player") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 px-3 gap-2"
                    disabled={appState === "ai_playing" || magenta.isLoading}
                  >
                    {magenta.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                    <span className="hidden sm:inline">
                      {AI_MODELS.llm.find((m) => m.value === selectedModel)?.label ||
                        AI_MODELS.magenta.find((m) => m.value === selectedModel)?.label ||
                        "Model"}
                    </span>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Cloud Models (LLM)</DropdownMenuLabel>
                  {AI_MODELS.llm.map((model) => (
                    <DropdownMenuItem
                      key={model.value}
                      onClick={() => setSelectedModel(model.value)}
                      className={selectedModel === model.value ? "bg-accent" : ""}
                    >
                      {model.label}
                    </DropdownMenuItem>
                  ))}

                  {activeMode === "improv" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <span>Magenta (Local)</span>
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent>
                          {AI_MODELS.magenta.map((model) => (
                            <DropdownMenuItem
                              key={model.value}
                              onClick={() => setSelectedModel(model.value)}
                              className={selectedModel === model.value ? "bg-accent" : ""}
                            >
                              <div className="flex flex-col">
                                <span>{model.label}</span>
                                <span className="text-xs text-muted-foreground">{model.description}</span>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            {/* Play/Stop button for compose and improv modes */}
            {(activeMode === "compose" || activeMode === "improv") &&
              (() => {
                const mode = activeMode === "compose" ? composeMode : improvMode;
                return mode.isPlayingAll ? (
                  <Button variant="outline" size="sm" onClick={stopAiPlayback} className="gap-2">
                    <Square className="h-4 w-4" />
                    <span className="hidden sm:inline">Stop</span>
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={mode.handlePlayAll}
                    disabled={!mode.hasValidSessions}
                    className="gap-2 disabled:opacity-50"
                  >
                    <Play className="h-4 w-4" />
                    <span className="hidden sm:inline">Play</span>
                  </Button>
                );
              })()}

            {/* Copy menu for compose and improv modes */}
            {(activeMode === "compose" || activeMode === "improv") && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!(activeMode === "compose" ? composeMode : improvMode).hasValidSessions}
                    className="disabled:opacity-50"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-popover">
                  <DropdownMenuItem
                    onClick={async () => {
                      const mode = activeMode === "compose" ? composeMode : improvMode;
                      const seq = mode.getCombinedSequence();
                      if (seq) {
                        await navigator.clipboard.writeText(JSON.stringify(seq, null, 2));
                        toast({ title: "Copied all as NoteSequence" });
                      }
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy all as NoteSequence
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={async () => {
                      const mode = activeMode === "compose" ? composeMode : improvMode;
                      const seq = mode.getCombinedSequence();
                      if (seq) {
                        const abc = noteSequenceToAbc(seq);
                        await navigator.clipboard.writeText(abc);
                        toast({ title: "Copied all as ABC" });
                      }
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy all as ABC
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={clearCurrentHistory}
              disabled={!hasHistory}
              className="gap-2 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">Clear</span>
            </Button>
          </div>
        </div>
      </Tabs>

      {/* Mode-specific content */}
      {activeMode === "player" && playerMode.renderInput()}

      {/* Mode-specific history */}
      {activeMode === "compose" && composeMode.renderHistory()}
      {activeMode === "improv" && improvMode.renderHistory()}
      {activeMode === "player" && playerMode.renderHistory()}
    </div>
  );
};

export default Index;
