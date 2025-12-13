import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, RotateCcw } from "lucide-react";
import { NoteSequence } from "@/types/noteSequence";
import { LessonState, LessonPhase, createInitialLessonState } from "@/types/learningSession";
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
  onStartRecording,
  isRecording,
  userRecording,
  onClearRecording,
}: LearnModeProps) {
  const [prompt, setPrompt] = useState("");
  const [lesson, setLesson] = useState<LessonState>(createInitialLessonState());
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const hasEvaluatedRef = useRef(false);

  const generateLesson = useCallback(async (userPrompt: string, difficulty: number = 1, previousSequence?: NoteSequence) => {
    setIsLoading(true);
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
        phase: "demo",
        attempts: 0,
        validations: 0,
        feedback: null,
        difficulty,
        userPrompt,
      });

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
  }, [onPlaySequence, toast]);

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || isLoading) return;
    generateLesson(prompt.trim());
  }, [prompt, isLoading, generateLesson]);

  const handlePlayDemo = useCallback(() => {
    if (lesson.targetSequence.notes.length > 0) {
      onPlaySequence(lesson.targetSequence);
    }
  }, [lesson.targetSequence, onPlaySequence]);

  const handleDemoComplete = useCallback(() => {
    if (lesson.phase === "demo") {
      setLesson(prev => ({ ...prev, phase: "your_turn" }));
      hasEvaluatedRef.current = false;
      onClearRecording();
    }
  }, [lesson.phase, onClearRecording]);

  // Watch for playback completion to transition from demo to your_turn
  useEffect(() => {
    if (lesson.phase === "demo" && !isPlaying && lesson.targetSequence.notes.length > 0) {
      // Small delay after demo ends
      const timer = setTimeout(() => {
        handleDemoComplete();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, lesson.phase, lesson.targetSequence.notes.length, handleDemoComplete]);

  const evaluateAttempt = useCallback(async (userSequence: NoteSequence) => {
    setLesson(prev => ({ ...prev, phase: "evaluating" }));
    setIsLoading(true);

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

      const evaluation = data.evaluation as "correct" | "close" | "wrong";
      const feedback = data.feedback as string;

      setLesson(prev => ({
        ...prev,
        phase: "feedback",
        attempts: prev.attempts + 1,
        validations: evaluation === "correct" ? prev.validations + 1 : prev.validations,
        feedback,
      }));
    } catch (error) {
      console.error("Failed to evaluate attempt:", error);
      toast({
        title: "Evaluation failed",
        description: "We couldn't evaluate your attempt. Try again!",
        variant: "destructive",
      });
      setLesson(prev => ({ ...prev, phase: "your_turn" }));
      hasEvaluatedRef.current = false;
    } finally {
      setIsLoading(false);
    }
  }, [lesson.targetSequence, lesson.instruction, toast]);

  // Watch for recording completion to trigger evaluation
  useEffect(() => {
    if (
      lesson.phase === "your_turn" &&
      userRecording &&
      userRecording.notes.length > 0 &&
      !isRecording &&
      !hasEvaluatedRef.current
    ) {
      hasEvaluatedRef.current = true;
      evaluateAttempt(userRecording);
    }
  }, [lesson.phase, userRecording, isRecording, evaluateAttempt]);

  const handleTryAgain = useCallback(() => {
    setLesson(prev => ({ ...prev, phase: "your_turn", feedback: null }));
    hasEvaluatedRef.current = false;
    onClearRecording();
  }, [onClearRecording]);

  const handleNext = useCallback(() => {
    // Generate a new, slightly harder lesson
    generateLesson(lesson.userPrompt, lesson.difficulty + 1, lesson.targetSequence);
  }, [lesson.userPrompt, lesson.difficulty, lesson.targetSequence, generateLesson]);

  const handleReset = useCallback(() => {
    setLesson(createInitialLessonState());
    setPrompt("");
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
                onClick={() => setPrompt(suggestion)}
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
        <div className="space-y-6">
          <LessonCard
            instruction={lesson.instruction}
            phase={lesson.phase}
            attempts={lesson.attempts}
            validations={lesson.validations}
            feedback={lesson.feedback}
            isLoading={isLoading || isPlaying}
            onPlayDemo={handlePlayDemo}
            onTryAgain={handleTryAgain}
            onNext={handleNext}
          />

          {/* Reset Button */}
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={isLoading || isPlaying}
              className="gap-2 text-muted-foreground"
            >
              <RotateCcw className="w-4 h-4" />
              Start Over
            </Button>
          </div>
        </div>
      )}
    </div>
  );

  return {
    lesson,
    render,
  };
}
