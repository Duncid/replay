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

  // Track if we've processed the current recording
  const lastProcessedRecording = useRef<INoteSequence | null>(null);
  const silenceTimer = useRef<NodeJS.Timeout | null>(null);
  const preEvalTimer = useRef<NodeJS.Timeout | null>(null);
  
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
          toast.success(response.encouragement || "Let's practice!");
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

    // Don't change phase - stay on practice screen
    setIsEvaluating(true);

    try {
      if (debugMode) {
        const debugResponse = await evaluateAttempt.mutateAsync({
          tuneKey,
          nuggetId: currentNugget.nuggetId,
          userSequence: recording,
          localUserId,
          language,
          debug: true,
        });

        setIsEvaluating(false);
        setEvalDebugData({
          tuneKey,
          nuggetId: currentNugget.nuggetId,
          targetSequence: currentNugget.nugget.noteSequence,
          userSequence: recording,
          prompt: (debugResponse as any).prompt,
          request: (debugResponse as any).request,
        });
      } else {
        const response = await evaluateAttempt.mutateAsync({
          tuneKey,
          nuggetId: currentNugget.nuggetId,
          userSequence: recording,
          localUserId,
          language,
          debug: false,
        });

        setIsEvaluating(false);
        
        // Update evaluation inline - no phase change
        updateEvaluation(response);

        // Show toast feedback based on evaluation
        if (response.evaluation === 'pass') {
          toast.success(response.feedbackText, { duration: 3000 });
        } else if (response.evaluation === 'close') {
          toast(response.feedbackText, { duration: 3000 });
        } else {
          toast(response.feedbackText, { duration: 3000 });
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
        nuggetId: currentNugget.nuggetId,
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
    
    if (currentNugget?.nugget?.noteSequence) {
      onPlaySample(currentNugget.nugget.noteSequence as INoteSequence);
    }
  }, [currentNugget, onPlaySample]);

  const handleSwitchNugget = useCallback(() => {
    nextNugget();
    lastProcessedRecording.current = null;
    setIsEvaluating(false);
  }, [nextNugget]);

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
