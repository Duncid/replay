import { LessonCard, SkillToUnlock } from "@/components/LessonCard";
import { LessonDebugCard } from "@/components/LessonDebugCard";
import { EvaluationDebugCard } from "@/components/EvaluationDebugCard";
import { TeacherWelcome } from "@/components/TeacherWelcome";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
// import { useLessonRuns } from "@/hooks/useLessonRuns"; // No longer needed - lesson-start handles lesson run creation
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
  LessonStartResponse,
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
  localUserId?: string | null;
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
  localUserId,
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
  // Lesson mode state
  const [lessonMode, setLessonMode] = useState<"practice" | "evaluation">("practice");
  const [evaluationResult, setEvaluationResult] = useState<"positive" | "negative" | null>(null);
  // Evaluation debug state
  const [evaluationDebug, setEvaluationDebug] = useState<{
    prompt: string;
    userSequence: NoteSequence;
    evaluationType: "structured" | "free";
    pendingCall: () => Promise<void>;
    decidePrompt?: string;
  } | null>(null);
  const [graderOutput, setGraderOutput] = useState<GraderOutput | null>(null);
  const [coachOutput, setCoachOutput] = useState<CoachOutput | null>(null);
  const [freePracticeEvaluation, setFreePracticeEvaluation] = useState<{
    evaluation: "correct" | "close" | "wrong";
    feedback: string;
  } | null>(null);
  const { toast } = useToast();
  const hasEvaluatedRef = useRef(false);
  const generationRequestIdRef = useRef<string | null>(null);
  const evaluationRequestIdRef = useRef<string | null>(null);
  const userActionTokenRef = useRef<string>(crypto.randomUUID());
  const { t } = useTranslation();
  // Note: useLessonRuns hook kept for potential future use
  // lesson-start now handles lesson run creation
  // const { incrementAttempts, endLessonRun } = useLessonRuns(localUserId);

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
        body: { language, debug: false, localUserId },
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
  }, [language, localUserId, toast]);

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
        if (lesson.lessonNodeKey) {
          // CURRICULUM LESSON: Use lesson-start with setup overrides
          // Note: This creates a new lesson run. The old run remains for history.
          const { data, error } = await supabase.functions.invoke("lesson-start", {
            body: {
              lessonKey: lesson.lessonNodeKey,
              language,
              debug: false,
              suggestionHint: {
                setup: {
                  bpm: newBpm,
                  meter: newMeter,
                },
              },
            },
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          const lessonStartData = data as LessonStartResponse;

          if (!lessonStartData.instruction) {
            throw new Error("Invalid lesson response");
          }

          // Apply metronome settings from the response
          if (lessonStartData.metronome) {
            applyMetronomeSettings(lessonStartData.metronome);
          }

          // Update the lesson with the new data
          setLesson((prev) => ({
            ...prev,
            targetSequence: lessonStartData.demoSequence || prev.targetSequence,
            instruction: lessonStartData.instruction,
            lessonRunId: lessonStartData.lessonRunId, // New lesson run ID
            trackKey: lessonStartData.lessonBrief.trackKey,
            trackTitle: lessonStartData.lessonBrief.trackTitle,
            awardedSkills: lessonStartData.lessonBrief.awardedSkills || [],
          }));

          // Update skill unlock status if there are awarded skills
          if (lessonStartData.lessonBrief.awardedSkills && lessonStartData.lessonBrief.awardedSkills.length > 0) {
            const skillKey = lessonStartData.lessonBrief.awardedSkills[0];
            const skillTitle = await fetchSkillTitle(skillKey);
            const status = await fetchSkillStatus(skillKey, skillTitle);
            if (status) {
              setSkillToUnlock(status);
            }
          }

          // Reset evaluation state when regenerating
          setEvaluationResult(null);
          setLastComment(null);

          // Play the new example
          setTimeout(() => onPlaySequence(lessonStartData.demoSequence || lesson.targetSequence), 500);
        } else {
          // FREE-FORM PRACTICE: Use piano-learn
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

          // Apply metronome settings from the AI response
          if (data.metronome) {
            applyMetronomeSettings(data.metronome);
          }

          // Update the lesson with the new sequence
          setLesson((prev) => ({
            ...prev,
            targetSequence: data.sequence,
            instruction: data.instruction,
          }));

          // Reset evaluation state when regenerating
          setEvaluationResult(null);
          setLastComment(null);

          // Play the new example
          setTimeout(() => onPlaySequence(data.sequence), 500);
        }
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
      lesson.lessonNodeKey,
      lesson.targetSequence,
      lesson.userPrompt,
      lesson.instruction,
      lesson.difficulty,
      applyMetronomeSettings,
      fetchSkillStatus,
      fetchSkillTitle,
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
      // Clear debug state first, then set loading to ensure spinner shows
      setLessonDebug(null); // Clear any lesson debug state
      setLastComment(null);
      setIsLoading(true);

      try {
        let lessonRunId: string | undefined;
        let instruction: string;
        let targetSequence: NoteSequence;
        let trackKey: string | undefined;
        let trackTitle: string | undefined;
        let awardedSkills: string[] = [];
        let lessonBrief: LessonBrief | undefined;
        let metronomeSettings: LessonMetronomeSettings | undefined;

        if (lessonNodeKey) {
          // CURRICULUM LESSON: Use lesson-start
          const { data, error } = await supabase.functions.invoke("lesson-start", {
            body: {
              lessonKey: lessonNodeKey,
              language,
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

          const lessonStartData = data as LessonStartResponse;

          if (!lessonStartData.instruction) {
            throw new Error("Invalid lesson response");
          }

          lessonRunId = lessonStartData.lessonRunId;
          instruction = lessonStartData.instruction;
          targetSequence = lessonStartData.demoSequence || { notes: [], totalTime: 0 };
          lessonBrief = lessonStartData.lessonBrief;
          metronomeSettings = lessonStartData.metronome;
          trackKey = lessonBrief.trackKey;
          trackTitle = lessonBrief.trackTitle;
          awardedSkills = lessonBrief.awardedSkills || [];

          // Apply metronome settings from the response
          if (metronomeSettings) {
            applyMetronomeSettings(metronomeSettings);
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
        } else {
          // FREE-FORM PRACTICE: Use piano-learn
          const localizedPrompt =
            language === "fr"
              ? `${userPrompt} (Réponds uniquement en français et formule des consignes musicales concises.)`
              : userPrompt;

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

          instruction = data.instruction;
          targetSequence = data.sequence;
          metronomeSettings = data.metronome;

          // Apply metronome settings from the AI response
          if (metronomeSettings) {
            applyMetronomeSettings(metronomeSettings);
          }

          setSkillToUnlock(null);
        }

        setLesson({
          instruction,
          targetSequence,
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

        // Reset to practice mode when starting a new lesson
        setLessonMode("practice");
        setEvaluationResult(null);
        hasEvaluatedRef.current = false;
        onClearRecording();

        // Automatically play the demo
        setTimeout(() => onPlaySequence(targetSequence), 500);
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
        // On error, return to practice plan screen (welcome phase)
        setLesson(createInitialLessonState());
        setPrompt("");
        setLastComment(null);
        setLessonDebug(null);
        setLessonMode("practice");
        setEvaluationResult(null);
        onClearRecording();
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

  // Helper to execute evaluation after debug approval
  const executeEvaluation = useCallback(
    async (
      userSequence: NoteSequence,
      evaluationType: "structured" | "free"
    ) => {
      const actionToken = userActionTokenRef.current;
      const requestId = crypto.randomUUID();
      evaluationRequestIdRef.current = requestId;
      setIsEvaluating(true);
      setEvaluationDebug(null);
      setGraderOutput(null);
      setCoachOutput(null);
      setFreePracticeEvaluation(null);

      try {
        // STRUCTURED LESSON: Use lesson-evaluate → lesson-decide
        if (evaluationType === "structured" && lesson.lessonRunId) {
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
          setGraderOutput(graderOutput);

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
          // In debug mode, get prompt first and show it in results
          let decidePrompt: string | undefined;
          if (debugMode) {
            decidePrompt = JSON.stringify(
              {
                lessonRunId: lesson.lessonRunId,
                graderOutput,
              },
              null,
              2
            );
          }

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
          setCoachOutput(coachOutput);
          
          // Update debug card with decide prompt if in debug mode
          if (debugMode && decidePrompt && evaluationDebug) {
            setEvaluationDebug({
              ...evaluationDebug,
              decidePrompt,
            });
          }

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

          // Determine evaluation result based on grader output
          const isPositive = graderOutput.evaluation === "pass";
          setEvaluationResult(isPositive ? "positive" : "negative");
          
          // Return to practice mode after evaluation
          setLessonMode("practice");

          // Don't auto-regenerate - let user decide with Make Easier/Harder buttons
          // Store coach output for use in handleMakeEasier/harder
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
          setFreePracticeEvaluation({ evaluation, feedback });

          setLastComment(feedback);
          setLesson((prev) => ({
            ...prev,
            attempts: prev.attempts + 1,
          }));

          // Determine evaluation result
          const isPositive = evaluation === "correct";
          setEvaluationResult(isPositive ? "positive" : "negative");
          
          // Return to practice mode after evaluation
          setLessonMode("practice");

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

  // Main evaluateAttempt function - intercepts in debug mode
  const evaluateAttempt = useCallback(
    async (userSequence: NoteSequence) => {
      // In debug mode, get prompt first and show debug card
      if (debugMode) {
        try {
          let prompt = "";
          const evaluationType: "structured" | "free" =
            lesson.lessonRunId ? "structured" : "free";

          // Get prompt by calling with debug: true
          if (evaluationType === "structured") {
            const { data: promptData } = await supabase.functions.invoke(
              "lesson-evaluate",
              {
                body: {
                  lessonRunId: lesson.lessonRunId,
                  userSequence,
                  metronomeContext: {
                    bpm: metronomeBpm,
                    meter: metronomeTimeSignature,
                  },
                  debug: true,
                },
              }
            );
            prompt = promptData?.prompt || JSON.stringify(promptData, null, 2);
          } else {
            // For free practice, construct prompt manually
            prompt = JSON.stringify(
              {
                targetSequence: lesson.targetSequence,
                userSequence,
                instruction: lesson.instruction,
                language,
                model,
              },
              null,
              2
            );
          }

          // Show debug card
          setEvaluationDebug({
            prompt,
            userSequence,
            evaluationType,
            pendingCall: () => executeEvaluation(userSequence, evaluationType),
          });
          return;
        } catch (error) {
          console.error("Failed to get debug prompt:", error);
          // Fall through to normal execution
        }
      }

      // Normal mode or debug failed - proceed directly
      await executeEvaluation(
        userSequence,
        lesson.lessonRunId ? "structured" : "free"
      );
    },
    [
      debugMode,
      lesson.lessonRunId,
      lesson.targetSequence,
      lesson.instruction,
      metronomeBpm,
      metronomeTimeSignature,
      language,
      model,
      executeEvaluation,
    ]
  );

  // Watch for recording completion to trigger evaluation (only in evaluation mode)
  // In practice mode, no recording or evaluation happens
  // Only trigger if we're actively in evaluation mode and recording just completed
  useEffect(() => {
    if (
      lesson.phase === "your_turn" &&
      lessonMode === "evaluation" &&
      userRecording &&
      userRecording.notes.length > 0 &&
      !isRecording &&
      !hasEvaluatedRef.current &&
      !isEvaluating &&
      !evaluationDebug // Don't trigger if debug card is already shown
    ) {
      hasEvaluatedRef.current = true;
      evaluateAttempt(userRecording);
    }
  }, [lesson.phase, lessonMode, userRecording, isRecording, isEvaluating, evaluateAttempt, evaluationDebug]);

  // Enter evaluation mode
  const handleEvaluate = useCallback(() => {
    setLessonMode("evaluation");
    setEvaluationResult(null);
    setLastComment(null);
    // Clear any existing recording and reset evaluation state
    onClearRecording();
    hasEvaluatedRef.current = false;
    setEvaluationDebug(null);
    setGraderOutput(null);
    setCoachOutput(null);
    setFreePracticeEvaluation(null);
    // Recording will start when user actually plays (handled by parent)
    // Make sure we don't have any stale recording that would trigger evaluation immediately
  }, [onClearRecording]);

  // Make lesson easier (for negative evaluation results)
  const handleMakeEasier = useCallback(() => {
    if (!lesson.lessonRunId) return;
    
    // Use the coach's suggested adjustment if available
    if (coachOutput?.setupDelta) {
      const newBpm = coachOutput.setupDelta.bpm ?? metronomeBpm;
      const newMeter = coachOutput.setupDelta.meter ?? metronomeTimeSignature;

      if (coachOutput.setupDelta.bpm) {
        setMetronomeBpm(coachOutput.setupDelta.bpm);
      }
      if (coachOutput.setupDelta.meter) {
        setMetronomeTimeSignature(coachOutput.setupDelta.meter);
      }

      regenerateLessonWithNewSettings(newBpm, newMeter);
    } else {
      // Fallback: reduce difficulty and regenerate
      generateLesson(
        lesson.userPrompt,
        Math.max(1, lesson.difficulty - 1),
        lesson.targetSequence,
        lesson.lessonNodeKey
      );
    }
    
    setEvaluationResult(null);
    setLastComment(null);
  }, [
    lesson.lessonRunId,
    lesson.userPrompt,
    lesson.difficulty,
    lesson.targetSequence,
    lesson.lessonNodeKey,
    coachOutput,
    metronomeBpm,
    metronomeTimeSignature,
    setMetronomeBpm,
    setMetronomeTimeSignature,
    regenerateLessonWithNewSettings,
    generateLesson,
  ]);

  // Make lesson harder (for positive evaluation results)
  const handleMakeHarder = useCallback(() => {
    if (!lesson.lessonRunId) return;
    
    // Use the coach's suggested adjustment if available
    if (coachOutput?.setupDelta) {
      const newBpm = coachOutput.setupDelta.bpm ?? metronomeBpm;
      const newMeter = coachOutput.setupDelta.meter ?? metronomeTimeSignature;

      if (coachOutput.setupDelta.bpm) {
        setMetronomeBpm(coachOutput.setupDelta.bpm);
      }
      if (coachOutput.setupDelta.meter) {
        setMetronomeTimeSignature(coachOutput.setupDelta.meter);
      }

      regenerateLessonWithNewSettings(newBpm, newMeter);
    } else {
      // Fallback: increase difficulty and regenerate
      generateLesson(
        lesson.userPrompt,
        lesson.difficulty + 1,
        lesson.targetSequence,
        lesson.lessonNodeKey
      );
    }
    
    setEvaluationResult(null);
    setLastComment(null);
  }, [
    lesson.lessonRunId,
    lesson.userPrompt,
    lesson.difficulty,
    lesson.targetSequence,
    lesson.lessonNodeKey,
    coachOutput,
    metronomeBpm,
    metronomeTimeSignature,
    setMetronomeBpm,
    setMetronomeTimeSignature,
    regenerateLessonWithNewSettings,
    generateLesson,
  ]);

  const handleLeave = useCallback(() => {
    markUserAction();
    setLesson(createInitialLessonState());
    setPrompt("");
    setLastComment(null);
    setLessonDebug(null);
    setLessonMode("practice");
    setEvaluationResult(null);
    onClearRecording();
    setTeacherGreeting(null);
  }, [markUserAction, onClearRecording]);

  // When a suggestion is clicked, fetch the debug prompt first (only in debug mode)
  const handleSelectActivity = useCallback(
    async (suggestion: TeacherSuggestion) => {
      // Build prompt from suggestion
      const lessonPrompt = `${suggestion.label}: ${suggestion.why}`;

      // In debug mode, fetch debug prompt and show debug card
      if (debugMode) {
        setIsLoadingLessonDebug(true);

        try {
          // For curriculum lessons, use lesson-start; for free-form, use piano-learn
          // Since suggestions always have lessonKey, use lesson-start
          const { data, error } = await supabase.functions.invoke("lesson-start", {
            body: {
              lessonKey: suggestion.lessonKey,
              language,
              debug: true,
            },
          });

          if (error) throw error;
          if (data?.error) throw new Error(data.error);

          // In debug mode, lesson-start returns { prompt, lessonBrief, setup }
          // In non-debug mode, it returns { composedPrompt, ... }
          const debugPrompt = data?.prompt || data?.composedPrompt;
          if (debugPrompt) {
            setLessonDebug({
              suggestion,
              prompt: debugPrompt,
            });
          } else {
            throw new Error("Debug mode not returning expected data");
          }
        } catch (err) {
          console.error("Failed to fetch lesson debug:", err);
          toast({
            title: "Error",
            description: err instanceof Error ? err.message : "Failed to prepare lesson",
            variant: "destructive",
          });
        } finally {
          setIsLoadingLessonDebug(false);
        }
      } else {
        // In normal mode, directly start the lesson
        generateLesson(lessonPrompt, 1, undefined, suggestion.lessonKey);
      }
    },
    [debugMode, language, toast, generateLesson]
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

  // Handle proceeding from evaluation debug card
  const handleProceedEvaluation = useCallback(() => {
    if (evaluationDebug) {
      evaluationDebug.pendingCall();
    }
  }, [evaluationDebug]);

  const handleCancelEvaluation = useCallback(() => {
    setEvaluationDebug(null);
    setGraderOutput(null);
    setCoachOutput(null);
    setFreePracticeEvaluation(null);
    setIsEvaluating(false);
    hasEvaluatedRef.current = false;
    // Return to practice mode when cancelling
    setLessonMode("practice");
    onClearRecording();
  }, [onClearRecording]);

  const suggestions = [
    ...((t("learnMode.suggestions", { returnObjects: true }) as string[]) ||
      []),
  ];

  const render = () => (
    <>
      {evaluationDebug ? (
        /* Evaluation Debug Card - shown before evaluation LLM calls */
        <EvaluationDebugCard
          prompt={evaluationDebug.prompt}
          userSequence={evaluationDebug.userSequence}
          evaluationType={evaluationDebug.evaluationType}
          onProceed={handleProceedEvaluation}
          onCancel={handleCancelEvaluation}
          graderOutput={graderOutput}
          coachOutput={coachOutput}
          freePracticeEvaluation={freePracticeEvaluation}
          decidePrompt={evaluationDebug.decidePrompt}
        />
      ) : isLoading && lesson.phase === "welcome" && !evaluationDebug ? (
        /* Loading spinner while generating lesson after selecting activity */
        /* This shows in both debug and normal mode when generating lesson */
        /* Show when loading, in welcome phase, and not showing evaluation debug */
        <div className="w-full max-w-2xl mx-auto">
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">
              {t("learnMode.generatingLesson", "Generating lesson...")}
            </p>
          </div>
        </div>
      ) : debugMode && lessonDebug && !isLoading ? (
        /* Lesson Debug Card - shown after selecting a suggestion (debug mode only) */
        <LessonDebugCard
          suggestion={lessonDebug.suggestion}
          prompt={lessonDebug.prompt}
          isLoading={isLoading}
          onStart={handleStartLesson}
          onCancel={handleCancelLessonDebug}
        />
      ) : debugMode && isLoadingLessonDebug ? (
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
          localUserId={localUserId}
          debugMode={debugMode}
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
          mode={lessonMode}
          evaluationResult={evaluationResult}
          isRecording={isRecording && lessonMode === "evaluation"}
          onPlay={handlePlay}
          onEvaluate={handleEvaluate}
          onLeave={handleLeave}
          onMakeEasier={handleMakeEasier}
          onMakeHarder={handleMakeHarder}
          trackTitle={lesson.trackTitle}
          skillToUnlock={skillToUnlock}
        />
      )}
    </>
  );

  const handleUserAction = useCallback(() => {
    markUserAction();
  }, [markUserAction]);

  // Expose lesson mode to parent so it can control recording
  return { lesson, render, handleUserAction, handleFreePractice, lessonMode };
}
