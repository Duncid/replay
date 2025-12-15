import { useState, useCallback, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send } from "lucide-react";
import { NoteSequence } from "@/types/noteSequence";
import { LessonState, createInitialLessonState } from "@/types/learningSession";
import { LessonCard } from "@/components/LessonCard";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";

interface LearnModeProps {
  isPlaying: boolean;
  onPlaySequence: (sequence: NoteSequence) => void;
  onStartRecording: () => void;
  isRecording: boolean;
  userRecording: NoteSequence | null;
  onClearRecording: () => void;
  language: string;
  model: string;
}

export function LearnMode({
  isPlaying,
  onPlaySequence,
  isRecording,
  userRecording,
  onClearRecording,
  language,
  model,
}: LearnModeProps) {
  const [prompt, setPrompt] = useState("");
  const [lesson, setLesson] = useState<LessonState>(createInitialLessonState());
  const [isLoading, setIsLoading] = useState(false);
  const [lastComment, setLastComment] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const { toast } = useToast();
  const hasEvaluatedRef = useRef(false);
  const generationRequestIdRef = useRef<string | null>(null);
  const evaluationRequestIdRef = useRef<string | null>(null);
  const userActionTokenRef = useRef<string>(crypto.randomUUID());
  const { t } = useTranslation();

  const markUserAction = useCallback(() => {
    userActionTokenRef.current = crypto.randomUUID();
    generationRequestIdRef.current = null;
    evaluationRequestIdRef.current = null;
    hasEvaluatedRef.current = false;
    setIsLoading(false);
    setIsEvaluating(false);
  }, []);

  const generateLesson = useCallback(async (userPrompt: string, difficulty: number = 1, previousSequence?: NoteSequence) => {
    markUserAction();
    const actionToken = userActionTokenRef.current;
    const requestId = crypto.randomUUID();
    generationRequestIdRef.current = requestId;
    setIsLoading(true);
    setLastComment(null);
    const localizedPrompt =
      language === "fr"
        ? `${userPrompt} (Réponds uniquement en français et formule des consignes musicales concises.)`
        : userPrompt;

    try {
      const { data, error } = await supabase.functions.invoke("piano-learn", {
        body: { prompt: localizedPrompt, difficulty, previousSequence, language, model },
      });

      if (generationRequestIdRef.current !== requestId || userActionTokenRef.current !== actionToken) return;

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
        title: t("learnMode.generateErrorTitle"),
        description: error instanceof Error ? error.message : t("learnMode.generateErrorDescription"),
        variant: "destructive",
      });
    } finally {
      if (generationRequestIdRef.current === requestId && userActionTokenRef.current === actionToken) {
        setIsLoading(false);
      }
    }
  }, [language, markUserAction, model, onClearRecording, onPlaySequence, t, toast]);

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
    const actionToken = userActionTokenRef.current;
    const requestId = crypto.randomUUID();
    evaluationRequestIdRef.current = requestId;
    setIsEvaluating(true);

    try {
      const { data, error } = await supabase.functions.invoke("piano-evaluate", {
        body: {
          targetSequence: lesson.targetSequence,
          userSequence,
          instruction: lesson.instruction,
          language,
          model,
        },
      });

      if (evaluationRequestIdRef.current !== requestId || userActionTokenRef.current !== actionToken) return;

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
      setLastComment(t("learnMode.evaluationFallback"));
    } finally {
      if (evaluationRequestIdRef.current === requestId && userActionTokenRef.current === actionToken) {
        setIsEvaluating(false);
        hasEvaluatedRef.current = false; // Allow next recording to be evaluated
        onClearRecording();
      }
    }
  }, [language, lesson.targetSequence, lesson.instruction, model, onClearRecording, onPlaySequence, t]);

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
    markUserAction();
    setLesson(createInitialLessonState());
    setPrompt("");
    setLastComment(null);
    onClearRecording();
  }, [markUserAction, onClearRecording]);

  const suggestions = [
    ...((t("learnMode.suggestions", { returnObjects: true }) as string[]) || []),
  ];

  const render = () => (
    <div className="space-y-8">
      {lesson.phase === "prompt" ? (
        /* Initial Prompt Input */
        <div className="w-full max-w-2xl mx-auto space-y-3">
          <Textarea
            placeholder={t("learnMode.promptPlaceholder")}
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
            {t("learnMode.startLearning")}
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
    handleUserAction: markUserAction,
  };
}
