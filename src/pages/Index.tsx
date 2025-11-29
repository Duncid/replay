import { useState, useRef } from "react";
import Piano, { PianoHandle, NoteWithDuration } from "@/components/Piano";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const Index = () => {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [aiPlaying, setAiPlaying] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const [selectedModel, setSelectedModel] = useState("google/gemini-2.5-flash");
  const { toast } = useToast();
  const pianoRef = useRef<PianoHandle>(null);
  const pendingResponseRef = useRef<{ sessionId: number; notes: NoteWithDuration[] } | null>(null);
  const currentSessionIdRef = useRef(0);

  const playAiResponse = async (notes: NoteWithDuration[]) => {
    setAiPlaying(true);
    
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
      await new Promise(resolve => setTimeout(resolve, noteDuration));
      
      // Clear active keys
      setActiveKeys(new Set());
      
      // Small pause between notes
      if (i < notes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    setAiPlaying(false);
  };

  const handleUserPlay = async (userNotes: NoteWithDuration[], sessionId: number) => {
    if (!isEnabled || aiPlaying) return;

    console.log("User played:", userNotes, "Session:", sessionId);

    try {
      const { data, error } = await supabase.functions.invoke("jazz-improvise", {
        body: { userNotes, model: selectedModel },
      });

      if (error) {
        throw error;
      }

      console.log("AI response:", data, "Session:", sessionId);

      // Store and immediately play the response if it's for the current session
      if (data.notes && data.notes.length > 0) {
        pendingResponseRef.current = { sessionId, notes: data.notes };
        console.log("Stored AI response for session:", sessionId);
        
        // Trigger playback
        handleCountdownComplete(sessionId);
      }
    } catch (error) {
      console.error("Error getting AI response:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive",
      });
      // Hide progress indicator on error
      if (pianoRef.current) {
        (pianoRef.current as any).hideProgress?.();
      }
    }
  };

  const handleCountdownComplete = async (sessionId: number) => {
    console.log("Countdown complete for session:", sessionId, "Pending:", pendingResponseRef.current?.sessionId);
    
    // Hide the progress indicator
    if (pianoRef.current) {
      pianoRef.current.hideProgress();
    }
    
    // Play the pending AI response only if it matches this session
    if (pendingResponseRef.current?.sessionId === sessionId && currentSessionIdRef.current === sessionId) {
      const notes = pendingResponseRef.current.notes;
      pendingResponseRef.current = null;
      console.log("Playing AI response for session:", sessionId);
      await playAiResponse(notes);
    } else {
      console.log("No matching AI response to play for session:", sessionId, "Current session:", currentSessionIdRef.current);
    }
  };

  const handleCountdownCancelled = (sessionId: number) => {
    // Clear pending response only if it matches this session
    if (pendingResponseRef.current && pendingResponseRef.current.sessionId === sessionId) {
      pendingResponseRef.current = null;
    }
  };

  const handleNewSession = () => {
    // Increment session ID for new recording
    currentSessionIdRef.current += 1;
    return currentSessionIdRef.current;
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-background">
      <div className="fixed top-8 left-8 flex items-center gap-4 h-10">
        <div className="flex items-center gap-3">
          <Switch
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
            disabled={aiPlaying}
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
            <Select value={selectedModel} onValueChange={setSelectedModel} disabled={aiPlaying}>
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
        onUserPlay={handleUserPlay} 
        onCountdownCancelled={handleCountdownCancelled}
        onNewSession={handleNewSession}
        activeKeys={activeKeys} 
        aiPlaying={aiPlaying}
        isAiEnabled={isEnabled}
      />
    </div>
  );
};

export default Index;
