import { LessonCard, SkillToUnlock } from "@/components/LessonCard";
import { LessonDebugCard } from "@/components/LessonDebugCard";
import { TeacherWelcome } from "@/components/TeacherWelcome";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useLessonRuns } from "@/hooks/useLessonRuns";
import { supabase } from "@/integrations/supabase/client";
import {
  CoachNextAction,
  CoachOutput,
  createInitialLessonState,
  GraderOutput,
  LessonBrief,
  LessonFeelPreset,
  LessonMetronomeSettings,
  LessonMetronomeSoundType,
  LessonRunSetup,
  LessonState,
  TeacherGreetingResponse,
  TeacherSuggestion,
} from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";
import { Loader2, Send } from "lucide-react";
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
  debugMode: boolean;
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

interface LessonDebugState {
  suggestion: TeacherSuggestion;
  prompt: string;
}

export function LearnMode({
  isPlaying,
  onPlaySequence,
  isRecording,
  userRecording,
  onClearRecording,
  language,
  model,
  debugMode,
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
  const [teacherGreeting, setTeacherGreeting] =
    useState<TeacherGreetingResponse | null>(null);
  const [isLoadingTeacher, setIsLoadingTeacher] = useState(false);
  const [lessonDebug, setLessonDebug] = useState<LessonDebugState | null>(null);
  const [isLoadingLessonDebug, setIsLoadingLessonDebug] = useState(false);
  const [skillToUnlock, setSkillToUnlock] = useState<SkillToUnlock | null>(
    null
  );
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
    setSkillToUnlock(null);
  }, []);

  // No auto-fetch on mount - user must click "Start"

  // Fetch teacher greeting when user clicks Start
  const handleStartTeacherGreet = useCallback(async () => {
    setIsLoadingTeacher(true);
    try {
      const { data, error } = await supabase.functions.invoke("teacher-greet", {
        body: { language, debug: false },
      });

      if (error) {
        console.error("Teacher greet error:", error);
        toast({
          title: "Error",
          description: "Failed to get teacher greeting",
          variant: "destructive",
        });
        return;
      }

      if (data?.error) {
        console.error("Teacher greet returned error:", data.error);
        toast({
          title: "Error",
          description: data.error,
          variant: "destructive",
        });
        return;
      }

      setTeacherGreeting(data as TeacherGreetingResponse);
    } catch (err) {
      console.error("Failed to fetch teacher greeting:", err);
      toast({
        title: "Error",
        description: "Failed to connect to teacher",
        variant: "destructive",
      });
    } finally {
      setIsLoadingTeacher(false);
    }
  }, [language, toast]);

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

  // Fetch skill unlock status for a given skill key
  const fetchSkillStatus = useCallback(
    async (
      skillKey: string,
      skillTitle?: string
    ): Promise<SkillToUnlock | null> => {
      try {
        const { data: skillState } = await supabase
          .from("user_skill_state")
          .select("unlocked")
          .eq("skill_key", skillKey)
          .maybeSingle();

        return {
          skillKey,
          title: skillTitle || skillKey,
          isUnlocked: skillState?.unlocked ?? false,
        };
      } catch (err) {
        console.error("Failed to fetch skill status:", err);
        return null;
      }
    },
    []
  );

  // Fetch skill title from curriculum nodes
  const fetchSkillTitle = useCallback(
    async (skillKey: string): Promise<string> => {
      try {
        // Get latest published version
        const { data: latestVersion } = await supabase
          .from("curriculum_versions")
          .select("id")
          .eq("status", "published")
          .order("published_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (!latestVersion) return skillKey;

        const { data: skillNode } = await supabase
          .from("curriculum_nodes")
          .select("data")
          .eq("version_id", latestVersion.id)
          .eq("node_key", skillKey)
          .eq("node_type", "skill")
          .maybeSingle();

        if (skillNode?.data) {
          const skillData = skillNode.data as Record<string, unknown>;
          return (skillData.label as string) || skillKey;
        }
        return skillKey;
      } catch (err) {
        console.error("Failed to fetch skill title:", err);
        return skillKey;
      }
    },
    []
  );

  // Regenerate demo sequence with new BPM/meter settings
  const regenerateLessonWithNewSettings = useCallback(
    async (newBpm: number, newMeter: string) => {
      if (!lesson.lessonRunId || lesson.targetSequence.notes.length === 0)
        return;

      setIsLoading(true);
      try {
        const regeneratePrompt = lesson.userPrompt || lesson.instruction;
        const localizedPrompt =
          language === "fr"
            ? `${regeneratePrompt} (Réponds uniquement en français et formule des consignes musicales concises.)`
            : regeneratePrompt;

        const { data, error } = await supabase.functions.invoke("piano-learn", {
          body: {
            prompt: localizedPrompt,
            difficulty: lesson.difficulty,
            language,
            model,
            debug: false,
            // Pass the new BPM/meter so the AI generates at the right tempo
            metronomeBpm: newBpm,
            metronomeTimeSignature: newMeter,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (!data?.instruction || !data?.sequence) {
          throw new Error("Invalid lesson response");
        }

        // Update the lesson with the new sequence
        setLesson((prev) => ({
          ...prev,
          targetSequence: data.sequence,
          instruction: data.instruction,
        }));

        // Update the demo_sequence in the lesson_runs table
        await supabase
          .from("lesson_runs")
          .update({
            demo_sequence: data.sequence,
            setup: { bpm: newBpm, meter: newMeter },
          })
          .eq("id", lesson.lessonRunId);

        // Play the new example
        setTimeout(() => onPlaySequence(data.sequence), 500);
      } catch (err) {
        console.error("Failed to regenerate lesson:", err);
        toast({
          title: "Error",
          description: "Failed to regenerate lesson with new settings",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [
      lesson.lessonRunId,
      lesson.targetSequence.notes.length,
      lesson.userPrompt,
      lesson.instruction,
      lesson.difficulty,
      language,
      model,
      onPlaySequence,
      toast,
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
      setLessonDebug(null); // Clear any lesson debug state
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
            debug: false,
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
        let trackKey: string | undefined;
        let trackTitle: string | undefined;
        const awardedSkills: string[] = [];

        if (lessonNodeKey) {
          // Fetch track and skill info from curriculum edges
          const { data: latestVersion } = await supabase
            .from("curriculum_versions")
            .select("id")
            .eq("status", "published")
            .order("published_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (latestVersion) {
            // Fetch edges related to this lesson
            const { data: edges } = await supabase
              .from("curriculum_edges")
              .select("*")
              .eq("version_id", latestVersion.id)
              .or(
                `source_key.eq.${lessonNodeKey},target_key.eq.${lessonNodeKey}`
              );

            for (const edge of edges || []) {
              if (
                edge.source_key === lessonNodeKey &&
                edge.edge_type === "lesson_awards_skill"
              ) {
                awardedSkills.push(edge.target_key);
              } else if (
                edge.target_key === lessonNodeKey &&
                edge.edge_type === "track_contains_lesson"
              ) {
                trackKey = edge.source_key;
              }
            }

            // Fetch track title if we have a track key
            if (trackKey) {
              const { data: trackNode } = await supabase
                .from("curriculum_nodes")
                .select("data")
                .eq("version_id", latestVersion.id)
                .eq("node_key", trackKey)
                .eq("node_type", "track")
                .maybeSingle();

              if (trackNode?.data) {
                const trackData = trackNode.data as Record<string, unknown>;
                trackTitle = (trackData.label as string) || trackKey;
              }
            }

            // Fetch skill status for the first awarded skill
            if (awardedSkills.length > 0) {
              const skillTitle = await fetchSkillTitle(awardedSkills[0]);
              const status = await fetchSkillStatus(
                awardedSkills[0],
                skillTitle
              );
              setSkillToUnlock(status);
            } else {
              setSkillToUnlock(null);
            }
          }

          // Build lesson brief from available data
          const brief: LessonBrief = {
            lessonKey: lessonNodeKey,
            title:
              data.instruction.split("\n")[0]?.substring(0, 100) ||
              "Practice Exercise",
            goal: data.instruction,
            setupGuidance: "",
            evaluationGuidance: "Compare user's notes to the demo sequence",
            difficultyGuidance: "",
            requiredSkills: [],
            awardedSkills,
            nextLessonKey: null,
            trackKey,
            trackTitle,
          };

          const runId = await startLessonRun(
            lessonNodeKey,
            difficulty,
            {
              bpm: data.metronome?.bpm || metronomeBpm,
              meter: data.metronome?.timeSignature || metronomeTimeSignature,
            },
            data.sequence, // Pass demo sequence
            brief // Pass lesson brief
          );
          if (runId) lessonRunId = runId;
        } else {
          setSkillToUnlock(null);
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
          trackKey,
          trackTitle,
          awardedSkills,
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
      fetchSkillStatus,
      fetchSkillTitle,
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
        // STRUCTURED LESSON: Use lesson-evaluate → lesson-decide
        if (lesson.lessonRunId) {
          // Step 1: Call lesson-evaluate
          const { data: graderData, error: graderError } =
            await supabase.functions.invoke("lesson-evaluate", {
              body: {
                lessonRunId: lesson.lessonRunId,
                userSequence,
                metronomeContext: {
                  bpm: metronomeBpm,
                  meter: metronomeTimeSignature,
                },
              },
            });

          if (
            evaluationRequestIdRef.current !== requestId ||
            userActionTokenRef.current !== actionToken
          )
            return;

          if (graderError) throw graderError;
          if (graderData?.error) throw new Error(graderData.error);

          const graderOutput = graderData as GraderOutput;

          // Debug mode: toast grader evaluation
          if (debugMode) {
            const evalEmoji =
              graderOutput.evaluation === "pass"
                ? "✅"
                : graderOutput.evaluation === "close"
                ? "⚠️"
                : "❌";
            const evalLabel =
              graderOutput.evaluation === "pass"
                ? "Pass"
                : graderOutput.evaluation === "close"
                ? "Close"
                : "Fail";
            toast({
              title: `${evalEmoji} Grader: ${evalLabel}`,
              description:
                graderOutput.diagnosis?.join(", ") || graderOutput.feedbackText,
            });
          }

          // Step 2: Call lesson-decide with grader output
          const { data: coachData, error: coachError } =
            await supabase.functions.invoke("lesson-decide", {
              body: {
                lessonRunId: lesson.lessonRunId,
                graderOutput,
              },
            });

          if (
            evaluationRequestIdRef.current !== requestId ||
            userActionTokenRef.current !== actionToken
          )
            return;

          if (coachError) throw coachError;
          if (coachData?.error) throw new Error(coachData.error);

          const coachOutput = coachData as CoachOutput & {
            awardedSkills?: string[];
          };

          // Debug mode: toast coach decision and skills
          if (debugMode) {
            toast({
              title: `🎯 Coach: ${coachOutput.nextAction}`,
              description: coachOutput.setupDelta
                ? `Setup: ${JSON.stringify(coachOutput.setupDelta)}`
                : undefined,
            });

            if (
              coachOutput.awardedSkills &&
              coachOutput.awardedSkills.length > 0
            ) {
              toast({
                title: `🏆 Skills Awarded`,
                description: coachOutput.awardedSkills.join(", "),
              });
            }
          }

          // Update skill unlock status if skills were awarded
          if (
            coachOutput.awardedSkills &&
            coachOutput.awardedSkills.length > 0
          ) {
            const skillKey = coachOutput.awardedSkills[0];
            const skillTitle = await fetchSkillTitle(skillKey);
            const status = await fetchSkillStatus(skillKey, skillTitle);
            if (status) {
              setSkillToUnlock({ ...status, isUnlocked: true });
            }
          }

          setLastComment(coachOutput.feedbackText);
          setLesson((prev) => ({
            ...prev,
            attempts: prev.attempts + 1,
          }));

          // Handle coach's nextAction
          const handleNextAction = (
            action: CoachNextAction,
            setupDelta?: Partial<LessonRunSetup>
          ) => {
            switch (action) {
              case "RETRY_SAME":
                // Keep lesson running, just show feedback
                break;
              case "MAKE_EASIER":
              case "MAKE_HARDER": {
                // Apply setup delta (e.g., adjust BPM) and regenerate demo sequence
                const newBpm = setupDelta?.bpm ?? metronomeBpm;
                const newMeter = setupDelta?.meter ?? metronomeTimeSignature;

                if (setupDelta?.bpm) {
                  setMetronomeBpm(setupDelta.bpm);
                }
                if (setupDelta?.meter) {
                  setMetronomeTimeSignature(setupDelta.meter);
                }

                // Regenerate the lesson with the new settings
                regenerateLessonWithNewSettings(newBpm, newMeter);
                break;
              }
              case "EXIT_TO_MAIN_TEACHER":
                // End lesson, return to welcome phase
                setTimeout(() => {
                  setLesson(createInitialLessonState());
                  setPrompt("");
                  setLastComment(null);
                  onClearRecording();
                  // Keep teacher greeting so user can pick another activity
                }, 2000);
                break;
            }
          };

          handleNextAction(coachOutput.nextAction, coachOutput.setupDelta);

          // Auto-replay example when not passing
          if (graderOutput.evaluation !== "pass") {
            setTimeout(() => {
              if (lesson.targetSequence.notes.length > 0) {
                onPlaySequence(lesson.targetSequence);
              }
            }, 1000);
          }
        } else {
          // FREE PRACTICE: Keep using piano-evaluate
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

          // Debug mode: toast evaluation result
          if (debugMode) {
            const evalEmoji =
              evaluation === "correct"
                ? "✅"
                : evaluation === "close"
                ? "⚠️"
                : "❌";
            const evalLabel =
              evaluation === "correct"
                ? "Pass"
                : evaluation === "close"
                ? "Close"
                : "Fail";
            toast({
              title: `${evalEmoji} ${evalLabel}`,
              description: `Evaluation: ${evaluation}`,
            });
          }

          // Auto-replay example when notes were wrong
          if (evaluation === "wrong" || evaluation === "close") {
            setTimeout(() => {
              if (lesson.targetSequence.notes.length > 0) {
                onPlaySequence(lesson.targetSequence);
              }
            }, 1000);
          }
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
          hasEvaluatedRef.current = false;
          onClearRecording();
        }
      }
    },
    [
      debugMode,
      fetchSkillStatus,
      fetchSkillTitle,
      language,
      lesson.instruction,
      lesson.lessonRunId,
      lesson.targetSequence,
      metronomeBpm,
      metronomeTimeSignature,
      model,
      onClearRecording,
      onPlaySequence,
      regenerateLessonWithNewSettings,
      setMetronomeBpm,
      setMetronomeTimeSignature,
      t,
      toast,
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
    setLessonDebug(null);
    onClearRecording();
    setTeacherGreeting(null);
  }, [markUserAction, onClearRecording]);

  // When a suggestion is clicked, fetch the debug prompt first
  const handleSelectActivity = useCallback(
    async (suggestion: TeacherSuggestion) => {
      setIsLoadingLessonDebug(true);

      // Build prompt from suggestion
      const lessonPrompt = `${suggestion.label}: ${suggestion.why}`;

      try {
        const { data, error } = await supabase.functions.invoke("piano-learn", {
          body: {
            prompt: lessonPrompt,
            difficulty: 1, // Lesson Coach will determine actual difficulty
            language,
            model,
            debug: true,
          },
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        if (data?.debug && data?.prompt) {
          setLessonDebug({
            suggestion,
            prompt: data.prompt,
          });
        } else {
          throw new Error("Debug mode not returning expected data");
        }
      } catch (err) {
        console.error("Failed to fetch lesson debug:", err);
        toast({
          title: "Error",
          description: "Failed to prepare lesson",
          variant: "destructive",
        });
      } finally {
        setIsLoadingLessonDebug(false);
      }
    },
    [language, model, toast]
  );

  // Start the actual lesson after seeing the debug prompt
  const handleStartLesson = useCallback(() => {
    if (!lessonDebug) return;

    const suggestion = lessonDebug.suggestion;
    const prompt = `${suggestion.label}: ${suggestion.why}`;
    generateLesson(prompt, 1, undefined, suggestion.lessonKey); // Lesson Coach will determine difficulty
  }, [lessonDebug, generateLesson]);

  const handleCancelLessonDebug = useCallback(() => {
    setLessonDebug(null);
  }, []);

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
    <>
      {lessonDebug ? (
        /* Lesson Debug Card - shown after selecting a suggestion */
        <LessonDebugCard
          suggestion={lessonDebug.suggestion}
          prompt={lessonDebug.prompt}
          isLoading={isLoading}
          onStart={handleStartLesson}
          onCancel={handleCancelLessonDebug}
        />
      ) : isLoadingLessonDebug ? (
        /* Loading lesson debug */
        <div className="w-full max-w-2xl mx-auto">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Preparing lesson...</p>
          </div>
        </div>
      ) : lesson.phase === "welcome" ? (
        /* Teacher Welcome */
        <TeacherWelcome
          greeting={teacherGreeting}
          isLoading={isLoadingTeacher}
          onSelectActivity={handleSelectActivity}
          onStart={handleStartTeacherGreet}
          language={language}
        />
      ) : lesson.phase === "prompt" ? (
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
          trackTitle={lesson.trackTitle}
          skillToUnlock={skillToUnlock}
        />
      )}
    </>
  );

  const handleUserAction = useCallback(() => {
    markUserAction();
  }, [markUserAction]);

  return { lesson, render, handleUserAction, handleFreePractice };
}
