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
  const pendingResponseRef = useRef<NoteWithDuration[] | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const aiPlaybackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stopAiPlayback = () => {
    // Clear any active AI playback
    if (aiPlaybackTimeoutRef.current) {
      clearTimeout(aiPlaybackTimeoutRef.current);
      aiPlaybackTimeoutRef.current = null;
    }
    setActiveKeys(new Set());
    setAppState('idle');
  };

  const playAiResponse = async (notes: NoteWithDuration[]) => {
    setAppState('ai_playing');
    
    // Map note names to frequencies (same logic as Piano component)
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    
    for (let i = 0; i < notes.length; i++) {

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
    if (appState === 'ai_playing') {
      setAppState('idle');
    }
  };

  const handleUserPlayStart = () => {
    console.log("User started playing, current state:", appState);
    
    // Cancel any pending AI operations
    if (appState === 'waiting_for_ai') {
      console.log("Cancelling pending AI request");
      abortControllerRef.current?.abort();
      pendingResponseRef.current = null;
      if (pianoRef.current) {
        pianoRef.current.hideProgress();
      }
    } else if (appState === 'ai_playing') {
      console.log("Interrupting AI playback");
      stopAiPlayback();
    }
    
    setAppState('user_playing');
  };

  const handleUserPlay = async (userNotes: NoteWithDuration[]) => {
    if (!isEnabled) return;

    console.log("User finished playing:", userNotes);
    setAppState('waiting_for_ai');

    try {
      // Create new abort controller for this request
      abortControllerRef.current = new AbortController();
      
      const { data, error } = await supabase.functions.invoke("jazz-improvise", {
        body: { userNotes, model: selectedModel },
      });

      // Check if request was aborted
      if (abortControllerRef.current.signal.aborted) {
        console.log("Request was aborted");
        setAppState('idle');
        return;
      }

      if (error) {
        throw error;
      }

      console.log("AI response received:", data);

      // Store response - don't check state here since it's async
      if (data.notes && data.notes.length > 0) {
        pendingResponseRef.current = data.notes;
        console.log("Playing AI response");
        handleAiResponseReady();
      } else {
        console.log("No notes in response");
        setAppState('idle');
      }
    } catch (error) {
      // Ignore abort errors
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("Request aborted");
        setAppState('idle');
        return;
      }
      
      console.error("Error getting AI response:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive",
      });
      setAppState('idle');
      if (pianoRef.current) {
        pianoRef.current.hideProgress();
      }
    }
  };

  const handleAiResponseReady = async () => {
    console.log("AI response ready to play");
    
    // Hide progress indicator
    if (pianoRef.current) {
      pianoRef.current.hideProgress();
    }
    
    // Check if we were cancelled via abort controller
    if (abortControllerRef.current?.signal.aborted) {
      console.log("Playback cancelled");
      pendingResponseRef.current = null;
      setAppState('idle');
      return;
    }
    
    // Play the response if we have it
    if (pendingResponseRef.current) {
      const notes = pendingResponseRef.current;
      pendingResponseRef.current = null;
      await playAiResponse(notes);
    } else {
      console.log("No pending response");
      setAppState('idle');
    }
  };

  const handleCountdownCancelled = () => {
    // This is called when user starts playing during the countdown
    pendingResponseRef.current = null;
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
        onCountdownCancelled={handleCountdownCancelled}
        activeKeys={activeKeys} 
        isAiEnabled={isEnabled}
        allowInput={appState !== 'ai_playing'}
      />
    </div>
  );
};

export default Index;
