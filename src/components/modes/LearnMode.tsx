import { LessonCard } from "@/components/LessonCard";
import { QuestEditor } from "@/components/QuestEditor";
import { TeacherWelcome } from "@/components/TeacherWelcome";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLessonRuns } from "@/hooks/useLessonRuns";
import { supabase } from "@/integrations/supabase/client";
import {
  createInitialLessonState,
  LessonFeelPreset,
  LessonMetronomeSettings,
  LessonMetronomeSoundType,
  LessonState,
  TeacherGreetingResponse,
  TeacherSuggestion,
} from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";
import { Loader2, Map, Send } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  // Metronome control props
  metronomeBpm: number;
  setMetronomeBpm: (bpm: number) => void;
  metronomeTimeSignature: string;
  setMetronomeTimeSignature: (ts: string) => void;
  metronomeIsPlaying: boolean;
  setMetronomeIsPlaying: (playing: boolean) => void;
  setMetronomeFeel?: (feel: LessonFeelPreset) => void;
  setMetronomeSoundType?: (soundType: LessonMetronomeSoundType) => void;
}

export function LearnMode({
  isPlaying,
  onPlaySequence,
  isRecording,
  userRecording,
  onClearRecording,
  language,
  model,
  metronomeBpm,
  setMetronomeBpm,
  metronomeTimeSignature,
  setMetronomeTimeSignature,
  metronomeIsPlaying,
  setMetronomeIsPlaying,
  setMetronomeFeel,
  setMetronomeSoundType,
}: LearnModeProps) {
  const [prompt, setPrompt] = useState("");
  const [lesson, setLesson] = useState<LessonState>(createInitialLessonState());
  const [isLoading, setIsLoading] = useState(false);
  const [lastComment, setLastComment] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [questEditorOpen, setQuestEditorOpen] = useState(false);
  const [teacherGreeting, setTeacherGreeting] = useState<TeacherGreetingResponse | null>(null);
  const [isLoadingTeacher, setIsLoadingTeacher] = useState(false);
  const { toast } = useToast();
  const hasEvaluatedRef = useRef(false);
  const generationRequestIdRef = useRef<string | null>(null);
  const evaluationRequestIdRef = useRef<string | null>(null);
  const userActionTokenRef = useRef<string>(crypto.randomUUID());
  const { t } = useTranslation();
  const { startLessonRun, incrementAttempts, endLessonRun } = useLessonRuns();

  const markUserAction = useCallback(() => {
    userActionTokenRef.current = crypto.randomUUID();
    generationRequestIdRef.current = null;
    evaluationRequestIdRef.current = null;
    hasEvaluatedRef.current = false;
    setIsLoading(false);
    setIsEvaluating(false);
  }, []);

  // Fetch teacher greeting on mount
  useEffect(() => {
    const fetchTeacherGreeting = async () => {
      setIsLoadingTeacher(true);
      try {
        const { data, error } = await supabase.functions.invoke("teacher-greet", {
          body: { language },
        });

        if (error) {
          console.error("Teacher greet error:", error);
          return;
        }

        if (data?.error) {
          console.error("Teacher greet returned error:", data.error);
          return;
        }

        setTeacherGreeting(data as TeacherGreetingResponse);
      } catch (err) {
        console.error("Failed to fetch teacher greeting:", err);
      } finally {
        setIsLoadingTeacher(false);
      }
    };

    if (lesson.phase === "welcome") {
      fetchTeacherGreeting();
    }
  }, [language, lesson.phase]);

  // Apply metronome settings from a lesson response
  const applyMetronomeSettings = useCallback(
    (metronome?: LessonMetronomeSettings) => {
      if (!metronome) return;

      if (typeof metronome.bpm === "number") {
        setMetronomeBpm(metronome.bpm);
      }
      if (typeof metronome.timeSignature === "string") {
        setMetronomeTimeSignature(metronome.timeSignature);
      }
      if (typeof metronome.isActive === "boolean") {
        setMetronomeIsPlaying(metronome.isActive);
      }
      if (metronome.feel && setMetronomeFeel) {
        setMetronomeFeel(metronome.feel);
      }
      if (metronome.soundType && setMetronomeSoundType) {
        setMetronomeSoundType(metronome.soundType);
      }
    },
    [
      setMetronomeBpm,
      setMetronomeTimeSignature,
      setMetronomeIsPlaying,
      setMetronomeFeel,
      setMetronomeSoundType,
    ]
  );

  const generateLesson = useCallback(
    async (
      userPrompt: string,
      difficulty: number = 1,
      previousSequence?: NoteSequence,
      lessonNodeKey?: string
    ) => {
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
          body: {
            prompt: localizedPrompt,
            difficulty,
            previousSequence,
            language,
            model,
          },
        });

        if (
          generationRequestIdRef.current !== requestId ||
          userActionTokenRef.current !== actionToken
        )
          return;

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (!data?.instruction || !data?.sequence) {
          throw new Error("Invalid lesson response");
        }

        // Apply metronome settings from the AI response
        if (data.metronome) {
          applyMetronomeSettings(data.metronome);
        }

        // Start lesson run tracking if we have a lesson key
        let lessonRunId: string | undefined;
        if (lessonNodeKey) {
          const runId = await startLessonRun(lessonNodeKey, difficulty, {
            bpm: data.metronome?.bpm || metronomeBpm,
            meter: data.metronome?.timeSignature || metronomeTimeSignature,
          });
          if (runId) lessonRunId = runId;
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
          lessonNodeKey,
          lessonRunId,
        });

        hasEvaluatedRef.current = false;
        onClearRecording();

        // Automatically play the demo
        setTimeout(() => onPlaySequence(data.sequence), 500);
      } catch (error) {
        console.error("Failed to generate lesson:", error);
        toast({
          title: t("learnMode.generateErrorTitle"),
          description:
            error instanceof Error
              ? error.message
              : t("learnMode.generateErrorDescription"),
          variant: "destructive",
        });
      } finally {
        if (
          generationRequestIdRef.current === requestId &&
          userActionTokenRef.current === actionToken
        ) {
          setIsLoading(false);
        }
      }
    },
    [
      applyMetronomeSettings,
      language,
      markUserAction,
      metronomeBpm,
      metronomeTimeSignature,
      model,
      onClearRecording,
      onPlaySequence,
      startLessonRun,
      t,
      toast,
    ]
  );

  const handleSubmit = useCallback(() => {
    if (!prompt.trim() || isLoading) return;
    generateLesson(prompt.trim());
  }, [prompt, isLoading, generateLesson]);

  const handlePlay = useCallback(() => {
    if (lesson.targetSequence.notes.length > 0) {
      onPlaySequence(lesson.targetSequence);
    }
  }, [lesson.targetSequence, onPlaySequence]);

  const evaluateAttempt = useCallback(
    async (userSequence: NoteSequence) => {
      const actionToken = userActionTokenRef.current;
      const requestId = crypto.randomUUID();
      evaluationRequestIdRef.current = requestId;
      setIsEvaluating(true);

      try {
        const { data, error } = await supabase.functions.invoke(
          "piano-evaluate",
          {
            body: {
              targetSequence: lesson.targetSequence,
              userSequence,
              instruction: lesson.instruction,
              language,
              model,
            },
          }
        );

        if (
          evaluationRequestIdRef.current !== requestId ||
          userActionTokenRef.current !== actionToken
        )
          return;

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const feedback = data.feedback as string;
        const evaluation = data.evaluation as "correct" | "close" | "wrong";

        setLastComment(feedback);
        setLesson((prev) => ({
          ...prev,
          attempts: prev.attempts + 1,
        }));

        // Track attempt in lesson run
        if (lesson.lessonRunId) {
          await incrementAttempts(lesson.lessonRunId);
        }

        // End lesson run on pass
        if (evaluation === "correct" && lesson.lessonRunId) {
          await endLessonRun(lesson.lessonRunId, "pass");
        }

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
        if (
          evaluationRequestIdRef.current === requestId &&
          userActionTokenRef.current === actionToken
        ) {
          setIsEvaluating(false);
          hasEvaluatedRef.current = false; // Allow next recording to be evaluated
          onClearRecording();
        }
      }
    },
    [
      endLessonRun,
      incrementAttempts,
      language,
      lesson.instruction,
      lesson.lessonRunId,
      lesson.targetSequence,
      model,
      onClearRecording,
      onPlaySequence,
      t,
    ]
  );

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
    generateLesson(
      lesson.userPrompt,
      lesson.difficulty + 1,
      lesson.targetSequence,
      lesson.lessonNodeKey
    );
  }, [
    lesson.userPrompt,
    lesson.difficulty,
    lesson.targetSequence,
    lesson.lessonNodeKey,
    generateLesson,
  ]);

  const handleLeave = useCallback(() => {
    markUserAction();
    setLesson(createInitialLessonState());
    setPrompt("");
    setLastComment(null);
    onClearRecording();
    setTeacherGreeting(null);
  }, [markUserAction, onClearRecording]);

  const handleSelectActivity = useCallback(
    (suggestion: TeacherSuggestion) => {
      // Apply setup hints if provided
      if (suggestion.setupHint.bpm) {
        setMetronomeBpm(suggestion.setupHint.bpm);
      }
      if (suggestion.setupHint.meter) {
        setMetronomeTimeSignature(suggestion.setupHint.meter);
      }

      // Determine difficulty
      let difficulty = 1;
      if (suggestion.difficulty.mode === "set" && suggestion.difficulty.value) {
        difficulty = suggestion.difficulty.value;
      }

      // Build prompt from suggestion
      const prompt = `${suggestion.label}: ${suggestion.why}`;
      generateLesson(prompt, difficulty, undefined, suggestion.lessonKey);
    },
    [generateLesson, setMetronomeBpm, setMetronomeTimeSignature]
  );

  const handleFreePractice = useCallback(() => {
    setLesson((prev) => ({
      ...prev,
      phase: "prompt",
    }));
  }, []);

  const suggestions = [
    ...((t("learnMode.suggestions", { returnObjects: true }) as string[]) ||
      []),
  ];

  const render = () => (
    <div className="space-y-8">
      {lesson.phase === "welcome" ? (
        /* Teacher Welcome */
        <TeacherWelcome
          greeting={teacherGreeting}
          isLoading={isLoadingTeacher}
          onSelectActivity={handleSelectActivity}
          onFreePractice={handleFreePractice}
          language={language}
        />
      ) : lesson.phase === "prompt" ? (
        /* Initial Prompt Input */
        <div className="w-full max-w-2xl mx-auto space-y-3">
          <div className="flex justify-end mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setQuestEditorOpen(true)}
              disabled={isLoading || isPlaying}
            >
              <Map className="h-4 w-4 mr-2" />
              Quest Editor
            </Button>
          </div>
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
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
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
      <QuestEditor open={questEditorOpen} onOpenChange={setQuestEditorOpen} />
    </div>
  );

  return {
    lesson,
    render,
    handleUserAction: markUserAction,
  };
}
