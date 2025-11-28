import { useState, useRef } from "react";
import Piano, { PianoHandle } from "@/components/Piano";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";

const Index = () => {
  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [aiPlaying, setAiPlaying] = useState(false);
  const [isEnabled, setIsEnabled] = useState(true);
  const { toast } = useToast();
  const pianoRef = useRef<PianoHandle>(null);

  const playAiResponse = async (notes: string[]) => {
    setAiPlaying(true);
    
    // Jazz timing: approximately 120 BPM = 500ms per beat
    const noteDuration = 500;
    
    // Map note names to frequencies (same logic as Piano component)
    const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    
    for (let i = 0; i < notes.length; i++) {
      const note = notes[i];
      
      // Parse note (e.g., "C4" -> note: "C", octave: 4)
      const noteName = note.slice(0, -1);
      const octave = parseInt(note.slice(-1));
      
      // Calculate frequency
      const noteIndex = noteNames.indexOf(noteName);
      const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
      const frequency = 440 * Math.pow(2, semitonesFromA4 / 12);
      
      // Play audio
      if (pianoRef.current) {
        pianoRef.current.playNote(frequency, noteDuration / 1000);
      }
      
      // Add note to active keys for visual feedback
      setActiveKeys(new Set([note]));
      
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

  const handleUserPlay = async (userNotes: string[]) => {
    if (!isEnabled || aiPlaying) return;

    console.log("User played:", userNotes);

    try {
      toast({
        title: "AI is thinking...",
        description: "Creating a jazz response to your melody",
      });

      const { data, error } = await supabase.functions.invoke("jazz-improvise", {
        body: { userNotes },
      });

      if (error) {
        throw error;
      }

      console.log("AI response:", data);

      if (data.notes && data.notes.length > 0) {
        toast({
          title: "AI Response",
          description: `Playing ${data.notes.length} notes`,
        });
        
        // Small delay before AI starts playing
        await new Promise(resolve => setTimeout(resolve, 300));
        await playAiResponse(data.notes);
      }
    } catch (error) {
      console.error("Error getting AI response:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to get AI response",
        variant: "destructive",
      });
      setAiPlaying(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 bg-gradient-to-br from-background via-background to-card">
      <div className="w-full max-w-7xl space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
            Jazz Piano AI
          </h1>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            Play a few notes and let the AI improvise a jazz response. Watch as the keys light up
            with golden glow for your playing and cool blue for the AI's reply.
          </p>
        </div>

        <div className="flex justify-center gap-4">
          <Button
            variant={isEnabled ? "default" : "outline"}
            onClick={() => setIsEnabled(!isEnabled)}
            disabled={aiPlaying}
          >
            {isEnabled ? "AI Enabled" : "AI Disabled"}
          </Button>
        </div>

        <Piano ref={pianoRef} onUserPlay={handleUserPlay} activeKeys={activeKeys} aiPlaying={aiPlaying} />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl mx-auto text-sm">
          <div className="p-4 bg-card rounded-lg border border-border space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-key-active-user shadow-[var(--glow-user)]" />
              <span className="font-medium">Your Playing</span>
            </div>
            <p className="text-muted-foreground">
              Click keys to play notes. The AI listens and responds after you pause.
            </p>
          </div>
          
          <div className="p-4 bg-card rounded-lg border border-border space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 rounded-full bg-key-active-ai shadow-[var(--glow-ai)]" />
              <span className="font-medium">AI Response</span>
            </div>
            <p className="text-muted-foreground">
              Watch the AI improvise a jazz phrase in response to your melody.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
