import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { NoteSequence } from "@/types/noteSequence";
import { LessonState, createInitialLessonState } from "@/types/learningSession";
import { LessonCard } from "@/components/LessonCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface LearnModeProps {
  isPlaying: boolean;
  onPlaySequence: (sequence: NoteSequence) => void;
  onStartRecording: () => void;
  isRecording: boolean;
  userRecording: NoteSequence | null;
  onClearRecording: () => void;
}

export function LearnMode({
  isPlaying,
  onPlaySequence,
  isRecording,
  userRecording,
  onClearRecording,
}: LearnModeProps) {
  const [prompt, setPrompt] = useState("");
  const [lesson, setLesson] = useState<LessonState>(createInitialLessonState());
  const [isLoading, setIsLoading] = useState(false);
  const [lastComment, setLastComment] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const { toast } = useToast();
  const hasEvaluatedRef = useRef(false);

  const generateLesson = useCallback(async (userPrompt: string, difficulty: number = 1, previousSequence?: NoteSequence) => {
    setIsLoading(true);
    setLastComment(null);
    try {
      const { data, error } = await supabase.functions.invoke("piano-learn", {
        body: { prompt: userPrompt, difficulty, previousSequence },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      if (!data?.instruction || !data?.sequence) {
        throw new Error("Invalid lesson response");
      }

      setLesson({
        instruction: data.instruction,
        targetSequence: data.sequence,
        phase: "your_turn",
        attempts: 0,
        validations: 0,
        feedback: null,
        difficulty,
        userPrompt,
      });

      hasEvaluatedRef.current = false;
      onClearRecording();

      // Automatically play the demo
      setTimeout(() => onPlaySequence(data.sequence), 500);
    } catch (error) {
      console.error("Failed to generate lesson:", error);
      toast({
        title: "Failed to generate lesson",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [onPlaySequence, onClearRecording, toast]);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || isLoading) return;
    generateLesson(prompt.trim());
  }, [prompt, isLoading, generateLesson]);

  const handlePlay = useCallback(() => {
    if (lesson.targetSequence.notes.length > 0) {
      onPlaySequence(lesson.targetSequence);
    }
  }, [lesson.targetSequence, onPlaySequence]);

  const evaluateAttempt = useCallback(async (userSequence: NoteSequence) => {
    setIsEvaluating(true);

    try {
      const { data, error } = await supabase.functions.invoke("piano-evaluate", {
        body: {
          targetSequence: lesson.targetSequence,
          userSequence,
          instruction: lesson.instruction,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const feedback = data.feedback as string;
      const evaluation = data.evaluation as "correct" | "close" | "wrong";
      
      setLastComment(feedback);
      setLesson(prev => ({
        ...prev,
        attempts: prev.attempts + 1,
      }));

      // Auto-replay example when notes were wrong
      if (evaluation === "wrong" || evaluation === "close") {
        setTimeout(() => {
          if (lesson.targetSequence.notes.length > 0) {
            onPlaySequence(lesson.targetSequence);
          }
        }, 1000); // Small delay so user can read feedback first
      }
    } catch (error) {
      console.error("Failed to evaluate attempt:", error);
      setLastComment("Couldn't evaluate - try again!");
    } finally {
      setIsEvaluating(false);
      hasEvaluatedRef.current = false; // Allow next recording to be evaluated
      onClearRecording();
    }
  }, [lesson.targetSequence, lesson.instruction, onClearRecording, onPlaySequence]);

  // Watch for recording completion to trigger evaluation
  useEffect(() => {
    if (
      lesson.phase === "your_turn" &&
      userRecording &&
      userRecording.notes.length > 0 &&
      !isRecording &&
      !hasEvaluatedRef.current &&
      !isEvaluating
    ) {
      hasEvaluatedRef.current = true;
      evaluateAttempt(userRecording);
    }
  }, [lesson.phase, userRecording, isRecording, isEvaluating, evaluateAttempt]);

  const handleNext = useCallback(() => {
    generateLesson(lesson.userPrompt, lesson.difficulty + 1, lesson.targetSequence);
  }, [lesson.userPrompt, lesson.difficulty, lesson.targetSequence, generateLesson]);

  const handleLeave = useCallback(() => {
    setLesson(createInitialLessonState());
    setPrompt("");
    setLastComment(null);
    onClearRecording();
  }, [onClearRecording]);

  const suggestions = [
    "Teach me a long jazzy sequence",
    "Teach me a moody classic sequence",
  ];

  const render = () => (
    <div className="space-y-8">
      {lesson.phase === "prompt" ? (
        /* Initial Prompt Input */
        <div className="w-full max-w-2xl mx-auto space-y-3">
          <Textarea
            placeholder="What would you like to learn? (e.g., 'a simple jazz chord progression' or 'basic blues riff')"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading || isPlaying}
            className="min-h-[120px] text-lg resize-none"
          />
          <div className="flex flex-wrap gap-2">
            {suggestions.map((suggestion) => (
              <Button
                key={suggestion}
                variant="outline"
                size="sm"
                onClick={() => {
                  setPrompt(suggestion);
                  generateLesson(suggestion);
                }}
                disabled={isLoading || isPlaying}
                className="text-muted-foreground"
              >
                {suggestion}
              </Button>
            ))}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={!prompt.trim() || isLoading || isPlaying}
            className="w-full gap-2"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Start Learning
          </Button>
        </div>
      ) : (
        /* Active Lesson */
        <LessonCard
          instruction={lesson.instruction}
          lastComment={lastComment}
          isEvaluating={isEvaluating}
          isLoading={isLoading || isPlaying}
          onPlay={handlePlay}
          onNext={handleNext}
          onLeave={handleLeave}
        />
      )}
    </div>
  );

  return {
    lesson,
    render,
  };
}
