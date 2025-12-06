import { useState, useRef } from "react";
import Piano, { PianoHandle } from "@/components/Piano";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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
import { SheetMusic } from "@/components/SheetMusic";
import { Button } from "@/components/ui/button";
import { Trash2, Brain, ChevronDown, Loader2 } from "lucide-react";
import { MidiConnector } from "@/components/MidiConnector";
import { useMidiInput } from "@/hooks/useMidiInput";
import { AskButton } from "@/components/AskButton";
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

interface SessionEntry {
  type: "jam" | "ask";
  userSequence: NoteSequence;
  aiSequence: NoteSequence;
  askPrompt?: string;
}

const Index = () => {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [appState, setAppState] = useState<AppState>("idle");
  const [isEnabled, setIsEnabled] = useState(true);
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash");
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
  const shouldStopAiRef = useRef<boolean>(false);
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

  const { connectedDevice, error: midiError, isSupported: isMidiSupported, requestAccess, disconnect } = useMidiInput(
    handleMidiNoteOn,
    handleMidiNoteOff
  );

  const stopAiPlayback = () => {
    shouldStopAiRef.current = true;
    if (aiPlaybackTimeoutRef.current) {
      clearTimeout(aiPlaybackTimeoutRef.current);
      aiPlaybackTimeoutRef.current = null;
    }
    setActiveKeys(new Set());
    setAppState("idle");
  };

  const playSequence = async (sequence: NoteSequence, requestId?: string, isReplay: boolean = false) => {
    if (!isReplay && requestId && currentRequestIdRef.current !== requestId) {
      console.log("Request invalidated before playback started");
      return;
    }

    console.log(`[Playback] Starting playback of ${sequence.notes.length} notes`);

    shouldStopAiRef.current = false;
    setAppState("ai_playing");

    sequence.notes.forEach((note) => {
      const noteKey = midiToNoteName(note.pitch);
      const frequency = midiToFrequency(note.pitch);
      const duration = note.endTime - note.startTime;

      setTimeout(() => {
        if (!shouldStopAiRef.current && pianoRef.current) {
          pianoRef.current.playNote(frequency, duration);
          setActiveKeys(prev => new Set([...prev, noteKey]));
        }
      }, note.startTime * 1000);

      setTimeout(() => {
        if (!shouldStopAiRef.current) {
          setActiveKeys(prev => {
            const newSet = new Set(prev);
            newSet.delete(noteKey);
            return newSet;
          });
        }
      }, note.endTime * 1000);
    });

    aiPlaybackTimeoutRef.current = setTimeout(() => {
      if (!shouldStopAiRef.current) {
        setAppState("idle");
        setActiveKeys(new Set());
      }
    }, sequence.totalTime * 1000);
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

    if (!isEnabled) {
      setSessionHistory((prev) => {
        if (prev.length > 0) {
          const lastSession = prev[prev.length - 1];
          if (lastSession.aiSequence.notes.length === 0) {
            const updatedUserSequence: NoteSequence = {
              ...lastSession.userSequence,
              notes: [...lastSession.userSequence.notes, ...userSequence.notes],
              totalTime: Math.max(lastSession.userSequence.totalTime, userSequence.totalTime),
            };
            return [...prev.slice(0, -1), { ...lastSession, userSequence: updatedUserSequence }];
          }
        }
        return [...prev, { type: "jam", userSequence, aiSequence: createEmptyNoteSequence(metronomeBpm, metronomeTimeSignature) }];
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
          metronomeTimeSignature
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
    console.log(`[Replay] Starting replay of ${sequence.notes.length} notes`);
    stopAiPlayback();
    await pianoRef.current?.ensureAudioReady();
    await new Promise(resolve => setTimeout(resolve, 50));
    await playSequence(sequence, undefined, true);
  };

  const clearHistory = () => {
    setSessionHistory([]);
    toast({ title: "History cleared", description: "Session history has been cleared" });
  };

  const handleAskSubmit = async (prompt: string, model: string) => {
    stopAiPlayback();
    await pianoRef.current?.ensureAudioReady();
    setAppState("waiting_for_ai");

    try {
      const { data, error } = await supabase.functions.invoke("piano-ask", {
        body: { prompt, model },
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
            askPrompt: prompt,
          },
        ]);

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
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4 bg-background gap-4">
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
        <AskButton 
          onAskSubmit={handleAskSubmit}
          disabled={appState === "waiting_for_ai" || appState === "ai_playing"}
        />
      </Metronome>
      
      <Piano
        ref={pianoRef}
        onUserPlayStart={handleUserPlayStart}
        onUserPlay={handleUserPlay}
        activeKeys={activeKeys}
        isAiEnabled={isEnabled}
        allowInput={appState === "idle" || appState === "user_playing" || appState === "waiting_for_ai"}
        bpm={metronomeBpm}
        timeSignature={metronomeTimeSignature}
      />

      <div className="w-full flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-card rounded-lg border border-border">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3">
            <Switch
              checked={isEnabled}
              onCheckedChange={setIsEnabled}
              disabled={appState === "ai_playing"}
              id="ai-toggle"
            />
            <Label htmlFor="ai-toggle" className="text-foreground cursor-pointer">
              AI mode
            </Label>
          </div>
          {isEnabled && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-8 px-3 gap-2"
                  disabled={appState === "ai_playing" || magenta.isLoading}
                >
                  {magenta.isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Brain className="w-4 h-4" />
                  )}
                  <span className="hidden sm:inline">
                    {AI_MODELS.llm.find(m => m.value === selectedModel)?.label ||
                     AI_MODELS.magenta.find(m => m.value === selectedModel)?.label ||
                     "Select Model"}
                  </span>
                  <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
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
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        
        {sessionHistory.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearHistory}
            className="gap-2 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="w-4 h-4" />
            Clear History
          </Button>
        )}
      </div>

      {sessionHistory.length > 0 && (
        <div className="w-full max-w-4xl space-y-4">
          {sessionHistory.map((entry, index) => (
            <div key={index} className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">
                {entry.type === "ask" 
                  ? `Request ${index + 1}: "${entry.askPrompt}"`
                  : `Session ${index + 1}`
                }
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
