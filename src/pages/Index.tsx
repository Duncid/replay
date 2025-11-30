import { useState, useRef } from "react";
import Piano, { PianoHandle, NoteWithDuration } from "@/components/Piano";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SheetMusic } from "@/components/SheetMusic";
import { notesToAbc, abcToNotes } from "@/utils/abcConverter";
import { Button } from "@/components/ui/button";
import { Trash2, Brain } from "lucide-react";
import { MidiConnector } from "@/components/MidiConnector";
import { useMidiInput } from "@/hooks/useMidiInput";

type AppState = "idle" | "user_playing" | "waiting_for_ai" | "ai_playing";

interface SessionEntry {
  userNotes: NoteWithDuration[];
  aiNotes: NoteWithDuration[];
  userAbc: string;
  aiAbc: string;
}

const Index = () => {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [appState, setAppState] = useState<AppState>("idle");
  const [isEnabled, setIsEnabled] = useState(true);
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash");
  const [sessionHistory, setSessionHistory] = useState<SessionEntry[]>([]);
  const { toast } = useToast();
  const pianoRef = useRef<PianoHandle>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const requestStartTimeRef = useRef<number>(0);
  const aiPlaybackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldStopAiRef = useRef<boolean>(false);
  const midiPressedKeysRef = useRef<Set<string>>(new Set());

  const MIN_WAIT_TIME_MS = 1000; // Match the progress bar duration

  // MIDI note handlers
  const handleMidiNoteOn = (noteKey: string, frequency: number) => {
    if ((appState !== "idle" && appState !== "user_playing") || midiPressedKeysRef.current.has(noteKey)) return;
    
    midiPressedKeysRef.current.add(noteKey);
    pianoRef.current?.handleKeyPress(noteKey, frequency);
  };

  const handleMidiNoteOff = (noteKey: string, frequency: number) => {
    if (!midiPressedKeysRef.current.has(noteKey)) return;
    
    midiPressedKeysRef.current.delete(noteKey);
    pianoRef.current?.handleKeyRelease(noteKey, frequency);
  };

  // Initialize MIDI hook - wrap callbacks to match expected signature
  const { connectedDevice, error: midiError, isSupported: isMidiSupported, requestAccess, disconnect } = useMidiInput(
    (noteKey: string, frequency: number, velocity: number) => handleMidiNoteOn(noteKey, frequency),
    handleMidiNoteOff
  );

  const stopAiPlayback = () => {
    // Signal AI playback to stop
    shouldStopAiRef.current = true;

    // Clear any active AI playback
    if (aiPlaybackTimeoutRef.current) {
      clearTimeout(aiPlaybackTimeoutRef.current);
      aiPlaybackTimeoutRef.current = null;
    }
    setActiveKeys(new Set());
    setAppState("idle");
  };

  const playNotes = async (notes: NoteWithDuration[], requestId?: string, isReplay: boolean = false) => {
    // Check if request is still valid (skip for replay)
    if (!isReplay && requestId && currentRequestIdRef.current !== requestId) {
      console.log("Request invalidated before playback started");
      return;
    }

    console.log(`[Playback] Starting playback of ${notes.length} notes (isReplay: ${isReplay})`);
    notes.forEach((n, i) => console.log(`  Note ${i}: ${n.note}, duration: ${n.duration}`));

    shouldStopAiRef.current = false;
    setAppState("ai_playing");

    // Map note names to frequencies (same logic as Piano component)
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

    // Calculate total playback time for precise timing
    let currentTime = 0;
    const pauseBetweenNotes = 0.1; // 100ms pause

    for (let i = 0; i < notes.length; i++) {
      // Check if we should stop (user interrupted)
      if (shouldStopAiRef.current) {
        console.log("AI playback interrupted");
        break;
      }

      const noteWithDuration = notes[i];

      // Parse note (e.g., "C4" -> note: "C", octave: 4)
      const noteName = noteWithDuration.note.slice(0, -1);
      const octave = parseInt(noteWithDuration.note.slice(-1));

      // Calculate frequency
      const noteIndex = noteNames.indexOf(noteName);
      const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
      const frequency = 440 * Math.pow(2, semitonesFromA4 / 12);

      // Convert beats to seconds (quarter note = 0.5s)
      const noteDuration = noteWithDuration.duration * 0.5;

      console.log(`[Playback] Note ${i}: ${noteWithDuration.note}, freq: ${frequency.toFixed(2)}Hz, duration: ${noteDuration}s, startTime: ${currentTime}s`);

      // Schedule note at precise time
      setTimeout(() => {
        if (!shouldStopAiRef.current && pianoRef.current) {
          pianoRef.current.playNote(frequency, noteDuration);
          setActiveKeys(new Set([noteWithDuration.note]));
        }
      }, currentTime * 1000);

      // Schedule visual clear
      setTimeout(() => {
        if (!shouldStopAiRef.current) {
          setActiveKeys(new Set());
        }
      }, (currentTime + noteDuration) * 1000);

      // Update time for next note
      currentTime += noteDuration + pauseBetweenNotes;
    }

    // Schedule return to idle
    const totalDuration = currentTime * 1000;
    aiPlaybackTimeoutRef.current = setTimeout(() => {
      if (!shouldStopAiRef.current) {
        setAppState("idle");
      }
    }, totalDuration);
  };

  const handleUserPlayStart = () => {
    console.log("User started playing, current state:", appState);

    // Invalidate any pending AI request by clearing the request ID
    currentRequestIdRef.current = null;

    // Hide progress bar
    pianoRef.current?.hideProgress();

    // Stop any AI playback
    if (appState === "ai_playing") {
      console.log("Interrupting AI playback");
      stopAiPlayback();
    }

    setAppState("user_playing");
  };

  const handleUserPlay = async (userNotes: NoteWithDuration[]) => {
    // Generate unique request ID
    const requestId = crypto.randomUUID();
    currentRequestIdRef.current = requestId;
    requestStartTimeRef.current = Date.now();

    console.log("User finished playing, request ID:", requestId);

    // If AI is disabled, append to current session or create new one
    if (!isEnabled) {
      setSessionHistory((prev) => {
        // If there's an existing session, append to it
        if (prev.length > 0) {
          const lastSession = prev[prev.length - 1];
          // Only append if last session has no AI notes (meaning it's a user-only session)
          if (lastSession.aiNotes.length === 0) {
            const updatedUserNotes = [...lastSession.userNotes, ...userNotes];
            const updatedUserAbc = notesToAbc(updatedUserNotes, "User Input");
            
            return [
              ...prev.slice(0, -1),
              {
                userNotes: updatedUserNotes,
                aiNotes: [],
                userAbc: updatedUserAbc,
                aiAbc: "",
              },
            ];
          }
        }
        
        // Create new session
        const userAbc = notesToAbc(userNotes, "User Input");
        return [
          ...prev,
          {
            userNotes,
            aiNotes: [],
            userAbc,
            aiAbc: "",
          },
        ];
      });
      setAppState("idle");
      return;
    }

    setAppState("waiting_for_ai");

    try {
      const { data, error } = await supabase.functions.invoke("jazz-improvise", {
        body: { userNotes, model: selectedModel },
      });

      // Check 1: Is this request still valid?
      if (currentRequestIdRef.current !== requestId) {
        console.log("Request invalidated (ID mismatch), discarding response");
        return; // Don't change state - user is already doing something else
      }

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      console.log("AI response received for request:", requestId);

      if (data.notes && data.notes.length > 0) {
        // Check 2: Enforce minimum wait time
        const elapsed = Date.now() - requestStartTimeRef.current;
        const remainingWait = MIN_WAIT_TIME_MS - elapsed;

        if (remainingWait > 0) {
          console.log(`Waiting ${remainingWait}ms before playing`);
          await new Promise((resolve) => setTimeout(resolve, remainingWait));
        }

        // Check 3: Is this request STILL valid after waiting?
        if (currentRequestIdRef.current !== requestId) {
          console.log("Request invalidated during wait, discarding response");
          return;
        }

        // Convert to ABC and save to history
        const userAbc = notesToAbc(userNotes, "User Input");
        const aiAbc = notesToAbc(data.notes, "AI Response");
        setSessionHistory((prev) => [
          ...prev,
          {
            userNotes,
            aiNotes: data.notes,
            userAbc,
            aiAbc,
          },
        ]);

        // Hide progress and play
        pianoRef.current?.hideProgress();
        await playNotes(data.notes, requestId);
      } else {
        console.log("No notes in response");
        if (currentRequestIdRef.current === requestId) {
          setAppState("idle");
          pianoRef.current?.hideProgress();
        }
      }
    } catch (error) {
      console.error("Error getting AI response:", error);

      // Only show error if this request is still valid
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

  const handleReplayNotes = async (notes: NoteWithDuration[]) => {
    console.log(`[Replay] Starting replay of ${notes.length} notes`);
    
    // Stop any ongoing activity
    stopAiPlayback();
    
    // Ensure AudioContext is ready BEFORE any playback
    await pianoRef.current?.ensureAudioReady();
    
    // Small delay to let state settle and avoid race conditions
    await new Promise(resolve => setTimeout(resolve, 50));
    
    await playNotes(notes, undefined, true);
    
    console.log(`[Replay] Replay completed`);
  };

  const clearHistory = () => {
    setSessionHistory([]);
    toast({
      title: "History cleared",
      description: "Session history has been cleared",
    });
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-start p-4 bg-background gap-4">
      <Piano
        ref={pianoRef}
        onUserPlayStart={handleUserPlayStart}
        onUserPlay={handleUserPlay}
        activeKeys={activeKeys}
        isAiEnabled={isEnabled}
        allowInput={appState === "idle" || appState === "user_playing"}
      />

      <div className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-4 px-4 py-3 bg-card rounded-lg border border-border">
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
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={appState === "ai_playing"}>
              <SelectTrigger id="model-select" className="w-10 h-8">
                <Brain className="w-4 h-4" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google/gemini-2.5-flash">Gemini Flash</SelectItem>
                <SelectItem value="google/gemini-2.5-pro">Gemini Pro</SelectItem>
                <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
              </SelectContent>
            </Select>
          )}
          <MidiConnector
            isConnected={!!connectedDevice}
            deviceName={connectedDevice?.name || null}
            error={midiError}
            isSupported={isMidiSupported}
            onConnect={requestAccess}
            onDisconnect={disconnect}
          />
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
              <div className="text-sm font-medium text-muted-foreground">Session {index + 1}</div>
              <div className="grid gap-3 md:grid-cols-2">
                <SheetMusic
                  abc={entry.userAbc}
                  label="You played:"
                  isUserNotes={true}
                  onReplay={() => handleReplayNotes(entry.userNotes)}
                />
                <SheetMusic
                  abc={entry.aiAbc}
                  label="AI responded:"
                  isUserNotes={false}
                  onReplay={() => handleReplayNotes(entry.aiNotes)}
                />
              </div>
              {index < sessionHistory.length - 1 && <div className="border-t border-border mt-4" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Index;
