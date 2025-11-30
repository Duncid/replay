import { useState, useRef } from "react";
import Piano, { PianoHandle, NoteWithDuration } from "@/components/Piano";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type AppState = 'idle' | 'user_playing' | 'waiting_for_ai' | 'ai_playing';

const Index = () => {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [appState, setAppState] = useState<AppState>('idle');
  const [isEnabled, setIsEnabled] = useState(true);
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash");
  const { toast } = useToast();
  const pianoRef = useRef<PianoHandle>(null);
  const currentRequestIdRef = useRef<string | null>(null);
  const requestStartTimeRef = useRef<number>(0);
  const aiPlaybackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const shouldStopAiRef = useRef<boolean>(false);

  const MIN_WAIT_TIME_MS = 1000; // Match the progress bar duration

  const stopAiPlayback = () => {
    // Signal AI playback to stop
    shouldStopAiRef.current = true;
    
    // Clear any active AI playback
    if (aiPlaybackTimeoutRef.current) {
      clearTimeout(aiPlaybackTimeoutRef.current);
      aiPlaybackTimeoutRef.current = null;
    }
    setActiveKeys(new Set());
    setAppState('idle');
  };

  const playAiResponse = async (notes: NoteWithDuration[], requestId: string) => {
    // Final check before playing
    if (currentRequestIdRef.current !== requestId) {
      console.log("Request invalidated before playback started");
      return;
    }
    
    shouldStopAiRef.current = false;
    setAppState('ai_playing');
    
    // Map note names to frequencies (same logic as Piano component)
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    
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
      
      // Convert beats to milliseconds (quarter note = 500ms)
      const noteDuration = noteWithDuration.duration * 500;
      
      // Play audio
      if (pianoRef.current) {
        pianoRef.current.playNote(frequency, noteDuration / 1000);
      }
      
      // Add note to active keys for visual feedback
      setActiveKeys(new Set([noteWithDuration.note]));
      
      // Wait for note duration
      await new Promise(resolve => {
        aiPlaybackTimeoutRef.current = setTimeout(resolve, noteDuration);
      });
      
      // Clear active keys
      setActiveKeys(new Set());
      
      // Small pause between notes
      if (i < notes.length - 1) {
        await new Promise(resolve => {
          aiPlaybackTimeoutRef.current = setTimeout(resolve, 100);
        });
      }
    }
    
    // Only return to idle if we weren't interrupted
    if (!shouldStopAiRef.current) {
      setAppState('idle');
    }
  };

  const handleUserPlayStart = () => {
    console.log("User started playing, current state:", appState);
    
    // Invalidate any pending AI request by clearing the request ID
    currentRequestIdRef.current = null;
    
    // Hide progress bar
    pianoRef.current?.hideProgress();
    
    // Stop any AI playback
    if (appState === 'ai_playing') {
      console.log("Interrupting AI playback");
      stopAiPlayback();
    }
    
    setAppState('user_playing');
  };

  const handleUserPlay = async (userNotes: NoteWithDuration[]) => {
    if (!isEnabled) return;

    // Generate unique request ID
    const requestId = crypto.randomUUID();
    currentRequestIdRef.current = requestId;
    requestStartTimeRef.current = Date.now();
    
    console.log("User finished playing, request ID:", requestId);
    setAppState('waiting_for_ai');

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
          await new Promise(resolve => setTimeout(resolve, remainingWait));
        }
        
        // Check 3: Is this request STILL valid after waiting?
        if (currentRequestIdRef.current !== requestId) {
          console.log("Request invalidated during wait, discarding response");
          return;
        }
        
        // Hide progress and play
        pianoRef.current?.hideProgress();
        await playAiResponse(data.notes, requestId);
      } else {
        console.log("No notes in response");
        if (currentRequestIdRef.current === requestId) {
          setAppState('idle');
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
        setAppState('idle');
        pianoRef.current?.hideProgress();
      }
    }
  };


  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-background">
      <div className="fixed top-8 left-8 flex items-center gap-4 h-10">
        <div className="flex items-center gap-3">
          <Switch
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
            disabled={appState === 'ai_playing'}
            id="ai-toggle"
          />
          <Label htmlFor="ai-toggle" className="text-foreground cursor-pointer">
            AI mode
          </Label>
        </div>
        {isEnabled && (
          <div className="flex items-center gap-3">
            <Label htmlFor="model-select" className="text-foreground whitespace-nowrap">
              Model:
            </Label>
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={appState === 'ai_playing'}>
              <SelectTrigger id="model-select" className="w-[200px] h-10">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="google/gemini-2.5-flash">Gemini Flash</SelectItem>
                <SelectItem value="google/gemini-2.5-pro">Gemini Pro</SelectItem>
                <SelectItem value="openai/gpt-5">GPT-5</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Piano 
        ref={pianoRef} 
        onUserPlayStart={handleUserPlayStart}
        onUserPlay={handleUserPlay}
        activeKeys={activeKeys} 
        isAiEnabled={isEnabled}
        allowInput={true}
      />
    </div>
  );
};

export default Index;
