import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useStartFreeFormLesson, useEvaluateFreeFormLesson } from "@/hooks/useLessonQueries";
import { LessonMetronomeSettings, LessonFeelPreset, LessonMetronomeSoundType } from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";
import { Loader2, Play, Send, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface FreePracticeModeProps {
  isPlaying: boolean;
  onPlaySequence: (sequence: NoteSequence) => void;
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
  onLeave?: () => void;
}

export function FreePracticeMode({
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
  onLeave,
}: FreePracticeModeProps) {
  const { t } = useTranslation();
  const { toast } = useToast();

  // State
  const [prompt, setPrompt] = useState("");
  const [targetSequence, setTargetSequence] = useState<NoteSequence | null>(null);
  const [instruction, setInstruction] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Refs to track evaluation state
  const hasEvaluatedRef = useRef(false);
  const previousRecordingRef = useRef<NoteSequence | null>(null);

  // Mutations
  const startFreeFormLessonMutation = useStartFreeFormLesson();
  const evaluateFreeFormLessonMutation = useEvaluateFreeFormLesson();

  // Apply metronome settings
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

  // Start a new lesson
  const handleStartLesson = useCallback(async () => {
    if (!prompt.trim() || isLoading) return;

    setIsLoading(true);
    setFeedback(null);
    setTargetSequence(null);
    setInstruction(null);
    hasEvaluatedRef.current = false;
    previousRecordingRef.current = null;
    onClearRecording();

    try {
      const localizedPrompt =
        language === "fr"
          ? `${prompt.trim()} (Réponds uniquement en français et formule des consignes musicales concises.)`
          : prompt.trim();

      const data = await startFreeFormLessonMutation.mutateAsync({
        prompt: localizedPrompt,
        difficulty: 1,
        language,
        model,
        debug: false,
      });

      setInstruction(data.instruction);
      setTargetSequence(data.sequence);

      // Apply metronome settings if provided
      if (data.metronome) {
        applyMetronomeSettings(data.metronome);
      }

      // Auto-play the demo sequence
      setTimeout(() => {
        if (data.sequence) {
          onPlaySequence(data.sequence);
        }
      }, 500);
    } catch (error) {
      console.error("Failed to start free practice lesson:", error);
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to start practice session",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [
    prompt,
    isLoading,
    language,
    model,
    startFreeFormLessonMutation,
    applyMetronomeSettings,
    onPlaySequence,
    onClearRecording,
    toast,
  ]);

  // Auto-evaluate when recording completes
  useEffect(() => {
    // Check if recording just completed (userRecording has notes and we haven't evaluated yet)
    const recordingJustCompleted = 
      userRecording !== null && 
      userRecording.notes.length > 0 && 
      previousRecordingRef.current === null &&
      !hasEvaluatedRef.current && 
      !isEvaluating && 
      targetSequence;

    if (recordingJustCompleted) {
      // Recording just completed, evaluate it
      hasEvaluatedRef.current = true;
      const recordingToEvaluate = userRecording;

      const evaluate = async () => {
        setIsEvaluating(true);
        try {
          const result = await evaluateFreeFormLessonMutation.mutateAsync({
            targetSequence,
            userSequence: recordingToEvaluate,
            instruction: instruction || "",
            language,
            model,
          });

          setFeedback(result.feedback);

          // If wrong, replay the exercise sequence
          if (result.evaluation === "wrong") {
            setTimeout(() => {
              if (targetSequence) {
                onPlaySequence(targetSequence);
              }
            }, 1000);
          }
        } catch (error) {
          console.error("Failed to evaluate:", error);
          toast({
            title: "Error",
            description: "Failed to evaluate your performance",
            variant: "destructive",
          });
        } finally {
          setIsEvaluating(false);
          hasEvaluatedRef.current = false;
          onClearRecording();
        }
      };

      evaluate();
    }

    // Update previous recording ref
    if (userRecording && userRecording.notes.length > 0) {
      previousRecordingRef.current = userRecording;
    } else if (userRecording === null) {
      // Recording cleared after evaluation
      previousRecordingRef.current = null;
    }
  }, [
    isRecording,
    userRecording,
    targetSequence,
    instruction,
    isEvaluating,
    language,
    model,
    evaluateFreeFormLessonMutation,
    onPlaySequence,
    onClearRecording,
    toast,
  ]);

  // Handle play button
  const handlePlay = useCallback(() => {
    if (targetSequence && targetSequence.notes.length > 0) {
      onPlaySequence(targetSequence);
    }
  }, [targetSequence, onPlaySequence]);

  // Handle leave
  const handleLeave = useCallback(() => {
    setPrompt("");
    setTargetSequence(null);
    setInstruction(null);
    setFeedback(null);
    hasEvaluatedRef.current = false;
    previousRecordingRef.current = null;
    onClearRecording();
    if (onLeave) {
      onLeave();
    }
  }, [onClearRecording, onLeave]);

  // Render input phase
  if (!targetSequence) {
    return (
      <div className="w-full max-w-2xl mx-auto space-y-3">
        <Textarea
          placeholder={t("learnMode.promptPlaceholder", "What would you like to practice?")}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={isLoading || isPlaying}
          className="min-h-[120px] text-lg resize-none"
        />
        <Button
          onClick={handleStartLesson}
          disabled={!prompt.trim() || isLoading || isPlaying}
          className="w-full gap-2"
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
          {t("learnMode.startLearning", "Start Practice")}
        </Button>
      </div>
    );
  }

  // Render practice phase
  return (
    <Card className="w-full max-w-2xl mx-auto border-border/50 backdrop-blur-sm bg-transparent border-0 relative">
      {/* Top right X button to leave */}
      <Button
        variant="ghost"
        size="icon"
        onClick={handleLeave}
        disabled={isLoading || isEvaluating}
        className="absolute top-2 right-2 h-8 w-8 text-muted-foreground hover:text-foreground z-10"
        aria-label={t("learnMode.leaveButton", "Leave")}
      >
        <X className="h-4 w-4" />
      </Button>
      <CardContent className="pt-6 space-y-4 border-0">
        {/* Exercise description */}
        <p className="text-center text-base">{instruction}</p>

        {/* Feedback area */}
        <div className="min-h-[2.5rem] flex items-center justify-center">
          {isEvaluating ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{t("learnMode.evaluating", "Evaluating...")}</span>
            </div>
          ) : feedback ? (
            <p className="text-muted-foreground italic text-center text-lg font-sans">
              {feedback}
            </p>
          ) : isRecording ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">{t("learnMode.playing", "Playing...")}</span>
            </div>
          ) : (
            <p className="text-muted-foreground/60 text-sm text-center">
              {t("learnMode.waitingForUser", "Play the sequence...")}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-center gap-3 pt-2">
          <Button
            variant="outline"
            onClick={handlePlay}
            disabled={isLoading || isEvaluating || isPlaying}
            className="gap-2"
          >
            <Play className="w-4 h-4" />
            {t("learnMode.playButton", "Play")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

