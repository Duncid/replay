import { useState, useRef } from "react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { SheetMusic } from "@/components/SheetMusic";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Trash2, Brain, ChevronDown, Loader2, Music, Sparkles, MessageSquare, Send } from "lucide-react";
import { MidiConnector } from "@/components/MidiConnector";
import { useMidiInput } from "@/hooks/useMidiInput";
import { Metronome } from "@/components/Metronome";
import { NoteSequence } from "@/types/noteSequence";
import { midiToFrequency, midiToNoteName, createEmptyNoteSequence } from "@/utils/noteSequenceUtils";
import { useMagenta, MagentaModelType } from "@/hooks/useMagenta";

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

interface SessionEntry {
  type: "jam" | "ask";
  userSequence: NoteSequence;
  aiSequence: NoteSequence;
  askPrompt?: string;
}

const Index = () => {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [appState, setAppState] = useState<AppState>("idle");
  const [activeMode, setActiveMode] = useState<ActiveMode>("compose");
  
  const handleModeChange = (newMode: ActiveMode) => {
    // If switching to player mode and a Magenta model is selected, switch to default LLM
    if (newMode === "player" && magenta.isMagentaModel(selectedModel)) {
      setSelectedModel("google/gemini-2.5-flash");
    }
    setActiveMode(newMode);
  };
  const [selectedModel, setSelectedModel] = useState("magenta/music-rnn");
  const [askPrompt, setAskPrompt] = useState("");
  const [isAskLoading, setIsAskLoading] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);
  const [sessionHistory, setSessionHistory] = useState<SessionEntry[]>([]);

  // Metronome state (lifted up)
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

  const MIN_WAIT_TIME_MS = 1000;

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

  const stopAiPlayback = () => {
    shouldStopAiRef.current = true;
    isPlayingRef.current = false;

    // Clear ALL scheduled timeouts
    noteTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    noteTimeoutsRef.current = [];

    if (aiPlaybackTimeoutRef.current) {
      clearTimeout(aiPlaybackTimeoutRef.current);
      aiPlaybackTimeoutRef.current = null;
    }
    setActiveKeys(new Set());
    setAppState("idle");
  };

  const playSequence = async (sequence: NoteSequence, requestId?: string, isReplay: boolean = false) => {
    setIsReplaying(isReplay);
    // Generate a unique ID for this playback call for debugging
    const playbackId = Math.random().toString(36).substring(7);

    if (!isReplay && requestId && currentRequestIdRef.current !== requestId) {
      console.log(`[Playback ${playbackId}] Request invalidated before playback started`);
      return;
    }

    // Prevent multiple simultaneous playback calls
    if (isPlayingRef.current) {
      console.log(`[Playback ${playbackId}] Already playing, stopping previous playback first`);
    }

    // Normalize times so first note starts at 0
    const minStartTime = sequence.notes.length > 0 ? Math.min(...sequence.notes.map((n) => n.startTime)) : 0;

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

    console.log(`[Playback ${playbackId}] ========== PLAYBACK START ==========`);
    console.log(`[Playback ${playbackId}] Notes: ${normalizedSequence.notes.length}, normalizedTotalTime: ${normalizedSequence.totalTime.toFixed(3)}s`);
    normalizedSequence.notes.forEach((n, i) => {
      console.log(`[Playback ${playbackId}] Scheduled Note ${i}: start=${n.startTime.toFixed(3)}s, end=${n.endTime.toFixed(3)}s, duration=${(n.endTime - n.startTime).toFixed(3)}s`);
    });
    const playbackStartTime = Date.now();

    // Clear ALL previous playback state including note timeouts
    shouldStopAiRef.current = true;
    noteTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    noteTimeoutsRef.current = [];
    if (aiPlaybackTimeoutRef.current) {
      clearTimeout(aiPlaybackTimeoutRef.current);
      aiPlaybackTimeoutRef.current = null;
    }
    setActiveKeys(new Set());
    isPlayingRef.current = true;

    // Small delay to ensure previous state is cleared
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Check again if this playback was cancelled during the delay
    if (!isPlayingRef.current) {
      console.log(`[Playback ${playbackId}] Playback cancelled during delay`);
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
          const actualElapsed = (Date.now() - playbackStartTime) / 1000;
          console.log(`[Playback ${playbackId}] Note ${noteKey} PLAYING at ${actualElapsed.toFixed(3)}s (scheduled: ${note.startTime.toFixed(3)}s, diff: ${(actualElapsed - note.startTime).toFixed(3)}s)`);
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
        const totalElapsed = (Date.now() - playbackStartTime) / 1000;
        console.log(`[Playback ${playbackId}] ========== PLAYBACK END ==========`);
        console.log(`[Playback ${playbackId}] Total elapsed: ${totalElapsed.toFixed(3)}s (expected: ${normalizedSequence.totalTime.toFixed(3)}s, diff: ${(totalElapsed - normalizedSequence.totalTime).toFixed(3)}s)`);
        setAppState("idle");
        setActiveKeys(new Set());
        noteTimeoutsRef.current = [];
        isPlayingRef.current = false;
        // Reset piano recording state so next session starts fresh
        pianoRef.current?.resetRecordingState();
      }
    }, normalizedSequence.totalTime * 1000);
  };

  const handleUserPlayStart = () => {
    console.log("User started playing, current state:", appState);

    // Invalidate any pending AI request
    const hadPendingRequest = currentRequestIdRef.current !== null;
    currentRequestIdRef.current = null;
    pianoRef.current?.hideProgress();

    if (appState === "ai_playing") {
      console.log("Interrupting AI playback");
      stopAiPlayback();
    }

    // If we were waiting for AI, restore the last recording to continue it
    if (appState === "waiting_for_ai" && hadPendingRequest) {
      console.log("Interrupted waiting_for_ai, restoring last recording");
      pianoRef.current?.restoreLastRecording();
    }

    setAppState("user_playing");
  };

  const handleUserPlay = async (userSequence: NoteSequence) => {
    const requestId = crypto.randomUUID();
    currentRequestIdRef.current = requestId;
    requestStartTimeRef.current = Date.now();

    console.log("User finished playing, request ID:", requestId);

    if (activeMode === "compose") {
      setSessionHistory((prev) => {
        if (prev.length > 0) {
          const lastSession = prev[prev.length - 1];
          if (lastSession.aiSequence.notes.length === 0) {
            // Offset new notes by the previous sequence's totalTime
            const timeOffset = lastSession.userSequence.totalTime;
            const offsetNotes = userSequence.notes.map((note) => ({
              ...note,
              startTime: note.startTime + timeOffset,
              endTime: note.endTime + timeOffset,
            }));
            const updatedUserSequence: NoteSequence = {
              ...lastSession.userSequence,
              notes: [...lastSession.userSequence.notes, ...offsetNotes],
              totalTime: timeOffset + userSequence.totalTime,
            };
            return [...prev.slice(0, -1), { ...lastSession, userSequence: updatedUserSequence }];
          }
        }
        return [
          ...prev,
          { type: "jam", userSequence, aiSequence: createEmptyNoteSequence(metronomeBpm, metronomeTimeSignature) },
        ];
      });
      setAppState("idle");
      return;
    }

    setAppState("waiting_for_ai");

    try {
      let aiSequence: NoteSequence | null = null;

      // Check if using Magenta (client-side) or LLM (server-side)
      if (magenta.isMagentaModel(selectedModel)) {
        console.log(`[AI Mode] Using Magenta model: ${selectedModel}`);

        aiSequence = await magenta.continueSequence(
          userSequence,
          selectedModel as MagentaModelType,
          metronomeBpm,
          metronomeTimeSignature,
        );

        // Check if request was invalidated during Magenta generation
        if (currentRequestIdRef.current !== requestId) {
          console.log("Request invalidated during Magenta generation, discarding");
          return;
        }

        if (!aiSequence) {
          throw new Error("Magenta failed to generate a response");
        }
      } else {
        // Use LLM via edge function
        console.log(`[AI Mode] Using LLM model: ${selectedModel}`);

        const { data, error } = await supabase.functions.invoke("jazz-improvise", {
          body: {
            userSequence,
            model: selectedModel,
            metronome: {
              bpm: metronomeBpm,
              timeSignature: metronomeTimeSignature,
              isActive: metronomeIsPlaying,
            },
          },
        });

        if (currentRequestIdRef.current !== requestId) {
          console.log("Request invalidated (ID mismatch), discarding response");
          return;
        }

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data.sequence && data.sequence.notes && data.sequence.notes.length > 0) {
          aiSequence = data.sequence as NoteSequence;
        }
      }

      if (currentRequestIdRef.current !== requestId) {
        console.log("Request invalidated (ID mismatch), discarding response");
        return;
      }

      console.log("AI response received for request:", requestId);

      if (aiSequence && aiSequence.notes && aiSequence.notes.length > 0) {
        const elapsed = Date.now() - requestStartTimeRef.current;
        const remainingWait = MIN_WAIT_TIME_MS - elapsed;

        if (remainingWait > 0) {
          console.log(`Waiting ${remainingWait}ms before playing`);
          await new Promise((resolve) => setTimeout(resolve, remainingWait));
        }

        if (currentRequestIdRef.current !== requestId) {
          console.log("Request invalidated during wait, discarding response");
          return;
        }

        setSessionHistory((prev) => [...prev, { type: "jam", userSequence, aiSequence: aiSequence! }]);

        pianoRef.current?.hideProgress();
        await playSequence(aiSequence, requestId);
      } else {
        console.log("No notes in response");
        if (currentRequestIdRef.current === requestId) {
          setAppState("idle");
          pianoRef.current?.hideProgress();
        }
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
        pianoRef.current?.hideProgress();
      }
    }
  };

  const handleReplaySequence = async (sequence: NoteSequence) => {
    // Prevent replay if already playing (guards against accidental double-clicks or race conditions)
    if (isPlayingRef.current) {
      console.log(`[Replay] Blocked - already playing`);
      return;
    }

    console.log(`[Replay Debug] ========== REPLAY START ==========`);
    console.log(`[Replay Debug] Total notes: ${sequence.notes.length}, totalTime: ${sequence.totalTime.toFixed(3)}s`);
    sequence.notes.forEach((n, i) => {
      console.log(`[Replay Debug] Note ${i}: start=${n.startTime.toFixed(3)}s, end=${n.endTime.toFixed(3)}s, duration=${(n.endTime - n.startTime).toFixed(3)}s`);
    });

    // Stop any current playback without resetting to idle (we're about to play again)
    shouldStopAiRef.current = true;
    noteTimeoutsRef.current.forEach((timeout) => clearTimeout(timeout));
    noteTimeoutsRef.current = [];
    if (aiPlaybackTimeoutRef.current) {
      clearTimeout(aiPlaybackTimeoutRef.current);
      aiPlaybackTimeoutRef.current = null;
    }
    setActiveKeys(new Set());

    await pianoRef.current?.ensureAudioReady();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await playSequence(sequence, undefined, true);
  };

  const clearHistory = () => {
    setSessionHistory([]);
    toast({ title: "History cleared", description: "Session history has been cleared" });
  };

  const handleAskSubmit = async () => {
    if (!askPrompt.trim() || isAskLoading) return;

    stopAiPlayback();
    await pianoRef.current?.ensureAudioReady();
    setAppState("waiting_for_ai");
    setIsAskLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke("piano-ask", {
        body: { prompt: askPrompt, model: selectedModel },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (data.sequence && data.sequence.notes && data.sequence.notes.length > 0) {
        const aiSequence = data.sequence as NoteSequence;
        setSessionHistory((prev) => [
          ...prev,
          {
            type: "ask",
            userSequence: createEmptyNoteSequence(metronomeBpm, metronomeTimeSignature),
            aiSequence,
            askPrompt,
          },
        ]);

        setAskPrompt("");
        await playSequence(aiSequence, undefined, true);

        toast({ title: "AI composed something!", description: `Playing: "${askPrompt}"` });
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
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4 bg-background gap-4 relative">
      {/* AI Playing / Replay indicator */}
      {appState === "ai_playing" && (
        <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-b-lg shadow-lg flex items-center gap-2 animate-pulse">
            <Sparkles className="w-4 h-4" />
            <span className="font-medium">{isReplaying ? "Replay" : "AI Playing"}</span>
          </div>
        </div>
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
        onUserPlayStart={handleUserPlayStart}
        onUserPlay={handleUserPlay}
        activeKeys={activeKeys}
        isAiEnabled={activeMode === "improv"}
        allowInput={appState === "idle" || appState === "user_playing" || appState === "waiting_for_ai"}
        bpm={metronomeBpm}
        timeSignature={metronomeTimeSignature}
      />

      <Tabs value={activeMode} onValueChange={(v) => handleModeChange(v as ActiveMode)} className="w-full">
        <div className="w-full flex flex-wrap items-center justify-between gap-4 py-2">
          <TabsList className="bg-muted">
            <TabsTrigger value="compose" className="gap-2">
              <Music className="w-4 h-4" />
              <span className="hidden sm:inline">Compose</span>
            </TabsTrigger>
            <TabsTrigger value="improv" className="gap-2">
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">AI Improv</span>
            </TabsTrigger>
            <TabsTrigger value="player" className="gap-2">
              <MessageSquare className="w-4 h-4" />
              <span className="hidden sm:inline">AI Player</span>
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

            {sessionHistory.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="gap-2 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">Clear</span>
              </Button>
            )}
          </div>
        </div>
      </Tabs>

      {activeMode === "player" && (
        <div className="w-full max-w-2xl mx-auto space-y-3">
          <Textarea
            placeholder="Describe what you'd like the AI to play..."
            value={askPrompt}
            onChange={(e) => setAskPrompt(e.target.value)}
            disabled={isAskLoading || appState === "ai_playing"}
            className="min-h-[120px] text-lg resize-none"
          />
          <Button
            onClick={handleAskSubmit}
            disabled={!askPrompt.trim() || isAskLoading || appState === "ai_playing"}
            className="w-full gap-2"
          >
            {isAskLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Generate Music
          </Button>
        </div>
      )}

      {sessionHistory.length > 0 && (
        <div className="w-full max-w-4xl space-y-4">
          {sessionHistory.map((entry, index) => (
            <div key={index} className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">
                {entry.type === "ask" ? `Request ${index + 1}: "${entry.askPrompt}"` : `Session ${index + 1}`}
              </div>
              {entry.type === "jam" ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <SheetMusic
                    sequence={entry.userSequence}
                    label="You played:"
                    isUserNotes={true}
                    onReplay={() => handleReplaySequence(entry.userSequence)}
                  />
                  <SheetMusic
                    sequence={entry.aiSequence}
                    label="AI responded:"
                    isUserNotes={false}
                    onReplay={() => handleReplaySequence(entry.aiSequence)}
                  />
                </div>
              ) : (
                <SheetMusic
                  sequence={entry.aiSequence}
                  label={`AI played: "${entry.askPrompt}"`}
                  isUserNotes={false}
                  onReplay={() => handleReplaySequence(entry.aiSequence)}
                />
              )}
              {index < sessionHistory.length - 1 && <div className="border-t border-border mt-4" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Index;
