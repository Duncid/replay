import React, { useEffect, useCallback, useState, useRef } from "react";
import { toast } from "sonner";
import { useTuneState } from "@/hooks/useTuneState";
import { useStartTunePractice, useEvaluateTuneAttempt } from "@/hooks/useTuneQueries";
import { TunePractice } from "./TunePractice";
import { TuneDebugCard } from "@/components/TuneDebugCard";
import { TuneEvaluationDebugCard } from "@/components/TuneEvaluationDebugCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import type { TuneDebugData, TuneEvaluationDebugData, TuneCoachResponse } from "@/types/tunePractice";
import type { INoteSequence } from "@magenta/music/es6";

interface TuneModeProps {
  tuneKey: string;
  localUserId?: string | null;
  language?: string;
  debugMode?: boolean;
  onLeave: () => void;
  onPlaySample: (sequence: INoteSequence) => void;
  isPlayingSample?: boolean;
  currentRecording?: INoteSequence | null;
  isRecording?: boolean;
}

export function TuneMode({
  tuneKey,
  localUserId,
  language = "en",
  debugMode = false,
  onLeave,
  onPlaySample,
  isPlayingSample = false,
  currentRecording,
  isRecording = false,
}: TuneModeProps) {
  const { state, currentNugget, setPhase, setPracticePlan, updateEvaluation, clearEvaluation, nextNugget, setError } = useTuneState(tuneKey);
  
  const startPractice = useStartTunePractice();
  const evaluateAttempt = useEvaluateTuneAttempt();

  const [coachDebugData, setCoachDebugData] = useState<TuneDebugData | null>(null);
  const [evalDebugData, setEvalDebugData] = useState<TuneEvaluationDebugData | null>(null);
  const [pendingCoachResponse, setPendingCoachResponse] = useState<TuneCoachResponse | null>(null);
  const [autoPlayTrigger, setAutoPlayTrigger] = useState(0);

  // Track if we've processed the current recording
  const lastProcessedRecording = useRef<INoteSequence | null>(null);
  const silenceTimer = useRef<NodeJS.Timeout | null>(null);
  const preEvalTimer = useRef<NodeJS.Timeout | null>(null);
  const lastAutoPlayKey = useRef<string | null>(null);
  
  // Track evaluation state for inline indicator
  const [isEvaluating, setIsEvaluating] = useState(false);

  // Auto-evaluate when recording stops (silence detected)
  useEffect(() => {
    // Reset when recording starts
    if (isRecording) {
      setIsEvaluating(false);
      clearEvaluation(); // Clear previous evaluation when user starts playing
      if (preEvalTimer.current) {
        clearTimeout(preEvalTimer.current);
        preEvalTimer.current = null;
      }
      if (silenceTimer.current) {
        clearTimeout(silenceTimer.current);
        silenceTimer.current = null;
      }
      return;
    }
    
    if (!isRecording && currentRecording && currentRecording !== lastProcessedRecording.current) {
      // Recording just stopped, start silence timer
      if (silenceTimer.current) {
        clearTimeout(silenceTimer.current);
      }
      if (preEvalTimer.current) {
        clearTimeout(preEvalTimer.current);
      }
      
      // Show "Evaluating..." after 0.5s of silence
      preEvalTimer.current = setTimeout(() => {
        setIsEvaluating(true);
      }, 500);
      
      silenceTimer.current = setTimeout(() => {
        if (state.phase === "practicing" && currentNugget && currentRecording.notes && currentRecording.notes.length > 0) {
          lastProcessedRecording.current = currentRecording;
          handleEvaluate(currentRecording);
        }
      }, 1500); // 1.5 second delay after recording stops
    }

    return () => {
      if (silenceTimer.current) {
        clearTimeout(silenceTimer.current);
      }
      if (preEvalTimer.current) {
        clearTimeout(preEvalTimer.current);
      }
    };
  }, [isRecording, currentRecording, state.phase, currentNugget]);

  // Initial load - fetch practice plan
  useEffect(() => {
    if (state.phase === "loading") {
      fetchPracticePlan();
    }
  }, [state.phase]);

  // Track whether this is a regeneration (plan was exhausted)
  const isRegeneration = state.practicePlan.length === 0 && state.currentIndex === 0 && state.phase === "loading";

  const fetchPracticePlan = async () => {
    try {
      setPhase("coaching");
      
      if (debugMode) {
        // In debug mode, fetch with debug flag to get prompt preview
        const debugResponse = await startPractice.mutateAsync({
          tuneKey,
          localUserId,
          language,
          debug: true,
        });
        
        setCoachDebugData({
          tuneKey,
          tuneTitle: (debugResponse as any).tuneTitle || tuneKey,
          motifsCount: (debugResponse as any).motifsCount || 0,
          nuggetsCount: (debugResponse as any).nuggetsCount || 0,
          practiceHistory: (debugResponse as any).practiceHistory || [],
          prompt: (debugResponse as any).prompt,
          request: (debugResponse as any).request,
        });
        
        // Store raw nuggets for later use
        setPendingCoachResponse(debugResponse as any);
      } else {
        const response = await startPractice.mutateAsync({
          tuneKey,
          localUserId,
          language,
          debug: false,
        });
        
        if (response.practicePlan && response.practicePlan.length > 0) {
          setPracticePlan(response.practicePlan, response.tuneTitle);
          // Show different message for regeneration vs first load
          toast.success(
            isRegeneration 
              ? "New practice plan ready!" 
              : (response.encouragement || "Let's practice!")
          );
        } else {
          throw new Error("No practice plan received");
        }
      }
    } catch (error) {
      console.error("Error fetching practice plan:", error);
      setError(error instanceof Error ? error.message : "Failed to load practice plan");
      toast.error("Failed to load practice plan");
    }
  };

  const proceedFromCoachDebug = async () => {
    setCoachDebugData(null);
    
    try {
      const response = await startPractice.mutateAsync({
        tuneKey,
        localUserId,
        language,
        debug: false,
      });
      
      if (response.practicePlan && response.practicePlan.length > 0) {
        setPracticePlan(response.practicePlan, response.tuneTitle);
        toast.success(response.encouragement || "Let's practice!");
      } else {
        throw new Error("No practice plan received");
      }
    } catch (error) {
      console.error("Error fetching practice plan:", error);
      setError(error instanceof Error ? error.message : "Failed to load practice plan");
      toast.error("Failed to load practice plan");
    }
  };

  const handleEvaluate = async (recording: INoteSequence) => {
    if (!currentNugget) return;

    // Get the note sequence from nugget, assembly, or full tune
    const targetSequence = (
      currentNugget.nugget?.noteSequence || 
      currentNugget.assembly?.noteSequence ||
      currentNugget.fullTune?.noteSequence
    ) as INoteSequence | undefined;
    const targetNoteCount = targetSequence?.notes?.length || 8;
    const maxNotes = targetNoteCount * 2;
    
    let trimmedRecording = recording;
    if (recording.notes && recording.notes.length > maxNotes) {
      const trimmedNotes = recording.notes.slice(-maxNotes); // Keep LAST notes
      trimmedRecording = {
        ...recording,
        notes: trimmedNotes,
        totalTime: trimmedNotes.length > 0 
          ? Math.max(...trimmedNotes.map(n => n.endTime || 0)) 
          : 0,
      };
      console.log(`[TuneMode] Trimmed recording from ${recording.notes.length} to ${trimmedNotes.length} notes (target: ${targetNoteCount})`);
    }

    // Don't change phase - stay on practice screen
    setIsEvaluating(true);

    try {
      if (debugMode) {
        const debugResponse = await evaluateAttempt.mutateAsync({
          tuneKey,
          nuggetId: currentNugget.itemId,
          userSequence: trimmedRecording,
          localUserId,
          language,
          debug: true,
        });

        setIsEvaluating(false);
        setEvalDebugData({
          tuneKey,
          nuggetId: currentNugget.itemId,
          targetSequence,
          userSequence: trimmedRecording,
          prompt: (debugResponse as any).prompt,
          request: (debugResponse as any).request,
        });
      } else {
        const response = await evaluateAttempt.mutateAsync({
          tuneKey,
          nuggetId: currentNugget.itemId,
          userSequence: trimmedRecording,
          localUserId,
          language,
          debug: false,
        });

        setIsEvaluating(false);
        
        // Update evaluation inline - no phase change
        updateEvaluation(response);

        // Celebratory toast for tune acquisition
        if (response.tuneAcquired) {
          toast.success(`Tune Acquired: ${state.tuneTitle}`);
        }

        // Celebratory toast for skill unlocks from tune
        if (response.awardedSkills && response.awardedSkills.length > 0) {
          const skillNames = response.awardedSkills.join(", ");
          toast.success(`Skill Unlocked: ${skillNames}`);
        }

        // Show toast feedback based on evaluation (only if no acquisition happened)
        if (!response.tuneAcquired && !response.awardedSkills?.length) {
          if (response.evaluation === 'pass') {
            toast.success(response.feedbackText, { duration: 3000 });
          } else if (response.evaluation === 'close') {
            toast(response.feedbackText, { duration: 3000 });
          } else {
            toast(response.feedbackText, { duration: 3000 });
          }
        }

        if (response.evaluation === "fail" && !isPlayingSample && !isRecording) {
          handlePlaySample();
        }
        
        // Suggest moving to next nugget if streak threshold reached
        if (response.suggestNewNugget && state.currentIndex < state.practicePlan.length - 1) {
          toast.info("Nice streak! Try the next section when you're ready.", { duration: 4000 });
        }
      }
    } catch (error) {
      console.error("Error evaluating attempt:", error);
      setIsEvaluating(false);
      toast.error("Failed to evaluate performance");
    }
  };

  const proceedFromEvalDebug = async () => {
    if (!currentNugget || !lastProcessedRecording.current) return;

    setEvalDebugData(null);
    setIsEvaluating(true);

    try {
      const response = await evaluateAttempt.mutateAsync({
        tuneKey,
        nuggetId: currentNugget.itemId,
        userSequence: lastProcessedRecording.current,
        localUserId,
        language,
        debug: false,
      });

      setIsEvaluating(false);
      updateEvaluation(response);
      
      // Show toast feedback
      if (response.evaluation === 'pass') {
        toast.success(response.feedbackText, { duration: 3000 });
      } else {
        toast(response.feedbackText, { duration: 3000 });
      }

      if (response.evaluation === "fail" && !isPlayingSample && !isRecording) {
        handlePlaySample();
      }
    } catch (error) {
      console.error("Error evaluating attempt:", error);
      setIsEvaluating(false);
      toast.error("Failed to evaluate performance");
    }
  };

  const handlePlaySample = useCallback(() => {
    // Reset recording state when playing sample
    lastProcessedRecording.current = null;
    setIsEvaluating(false);
    if (preEvalTimer.current) {
      clearTimeout(preEvalTimer.current);
      preEvalTimer.current = null;
    }
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
    
    // Get note sequence from nugget, assembly, or full tune
    const noteSequence = currentNugget?.nugget?.noteSequence || currentNugget?.assembly?.noteSequence || currentNugget?.fullTune?.noteSequence;
    if (noteSequence) {
      onPlaySample(noteSequence as INoteSequence);
    }
  }, [currentNugget, onPlaySample]);

  const handleSwitchNugget = useCallback(() => {
    nextNugget();
    lastProcessedRecording.current = currentRecording ?? null;
    setIsEvaluating(false);
    clearEvaluation();
    setAutoPlayTrigger((prev) => prev + 1);
    if (preEvalTimer.current) {
      clearTimeout(preEvalTimer.current);
      preEvalTimer.current = null;
    }
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, [nextNugget, currentRecording, clearEvaluation]);

  useEffect(() => {
    if (!currentNugget?.itemId) return;
    const autoPlayKey = `${currentNugget.itemId}:${autoPlayTrigger}`;
    if (lastAutoPlayKey.current === autoPlayKey) return;
    if (isPlayingSample || isRecording) return;
    lastAutoPlayKey.current = autoPlayKey;
    handlePlaySample();
  }, [currentNugget?.itemId, autoPlayTrigger, isPlayingSample, isRecording, handlePlaySample]);

  // Render based on phase
  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <p className="text-destructive mb-4">{state.error}</p>
        <button onClick={onLeave} className="text-primary hover:underline">
          Return to selection
        </button>
      </div>
    );
  }

  // Debug cards
  if (coachDebugData) {
    return (
      <TuneDebugCard
        debugData={coachDebugData}
        onProceed={proceedFromCoachDebug}
        onCancel={onLeave}
      />
    );
  }

  if (evalDebugData) {
    return (
      <TuneEvaluationDebugCard
        debugData={evalDebugData}
        onProceed={proceedFromEvalDebug}
        onCancel={() => {
          setEvalDebugData(null);
          setIsEvaluating(false);
        }}
      />
    );
  }

  // Loading states
  if (state.phase === "loading" || state.phase === "coaching") {
    return (
      <LoadingSpinner 
        message={state.phase === "loading" ? "Loading tune..." : "Preparing practice plan..."} 
      />
    );
  }

  // Practice phase - THE MAIN CONTINUOUS SCREEN
  if (state.phase === "practicing" && currentNugget) {
    return (
      <TunePractice
        tuneTitle={state.tuneTitle}
        currentNugget={currentNugget}
        currentIndex={state.currentIndex}
        totalNuggets={state.practicePlan.length}
        currentStreak={state.currentStreak}
        lastEvaluation={state.lastEvaluation}
        onPlaySample={handlePlaySample}
        onSwitchNugget={handleSwitchNugget}
        onLeave={onLeave}
        isPlaying={isPlayingSample}
        isEvaluating={isEvaluating}
        isRecording={isRecording}
      />
    );
  }

  // Fallback - practice plan exhausted, go back to coaching
  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <p className="text-foreground mb-4">Practice session complete!</p>
      <button onClick={fetchPracticePlan} className="text-primary hover:underline">
        Get new practice plan
      </button>
    </div>
  );
}
