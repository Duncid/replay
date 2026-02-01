import React, { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useTuneState } from "@/hooks/useTuneState";
import {
  useStartTunePractice,
  useEvaluateTuneAttempt,
  useTuneAssets,
} from "@/hooks/useTuneQueries";
import { TunePractice } from "./TunePractice";
import { TuneDebugCard } from "@/components/TuneDebugCard";
import { TuneEvaluationDebugCard } from "@/components/TuneEvaluationDebugCard";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import type { TuneDebugData, TuneEvaluationDebugData, TuneCoachResponse } from "@/types/tunePractice";
import type { INoteSequence } from "@magenta/music/es6";
import { useTranslation } from "react-i18next";

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
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
  onRegisterNoteOffHandler?: (handler: ((noteKey: string) => void) | null) => void;
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
  onRegisterNoteHandler,
  onRegisterNoteOffHandler,
}: TuneModeProps) {
  const { t } = useTranslation();
  const { state, currentNugget, setPhase, setPracticePlan, updateEvaluation, clearEvaluation, nextNugget, previousNugget, setError } = useTuneState(tuneKey);
  
  const startPractice = useStartTunePractice();
  const evaluateAttempt = useEvaluateTuneAttempt();
  const { data: tuneAssets } = useTuneAssets(tuneKey);

  const [coachDebugData, setCoachDebugData] = useState<TuneDebugData | null>(null);
  const [evalDebugData, setEvalDebugData] = useState<TuneEvaluationDebugData | null>(null);
  const [pendingCoachResponse, setPendingCoachResponse] = useState<TuneCoachResponse | null>(null);
  const [autoPlayTrigger, setAutoPlayTrigger] = useState(0);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Track if we've processed the current recording
  const lastProcessedRecording = useRef<INoteSequence | null>(null);
  const silenceTimer = useRef<NodeJS.Timeout | null>(null);
  const preEvalTimer = useRef<NodeJS.Timeout | null>(null);
  const lastAutoPlayKey = useRef<string | null>(null);
  
  // Evaluation indexing to handle out-of-order responses
  const evalIndexRef = useRef(0);
  const latestReceivedIndexRef = useRef(0);
  const [pendingEvalIndex, setPendingEvalIndex] = useState<number | undefined>(undefined);
  
  // Track evaluation state for inline indicator
  const [isEvaluating, setIsEvaluating] = useState(false);

  const dspXml = useMemo(() => {
    if (!tuneAssets || !currentNugget) return null;
    if (currentNugget.itemType === "full_tune") {
      return tuneAssets.tune_dsp_xml ?? tuneAssets.tune_xml ?? null;
    }
    if (currentNugget.itemType === "assembly") {
      const xmls = tuneAssets.assembly_dsp_xmls as Record<string, string> | null;
      return xmls?.[currentNugget.itemId] ?? null;
    }
    const xmls = tuneAssets.nugget_dsp_xmls as Record<string, string> | null;
    return xmls?.[currentNugget.itemId] ?? null;
  }, [currentNugget, tuneAssets]);

  const sanitizeNoteSequence = (sequence?: INoteSequence | null): INoteSequence | undefined => {
    if (!sequence) return undefined;
    const notes = (sequence.notes || []).map((note) => ({
      pitch: note.pitch,
      startTime: note.startTime,
      endTime: note.endTime,
    }));
    return { ...sequence, notes };
  };

  // Auto-evaluate when recording stops (silence detected)
  useEffect(() => {
    // Reset when recording starts
    if (isRecording) {
      setIsEvaluating(false);
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
              ? t("tune.planReady")
              : (response.encouragement || t("tune.letsPractice"))
          );
        } else {
          throw new Error("No practice plan received");
        }
      }
    } catch (error) {
      console.error("Error fetching practice plan:", error);
      setError(error instanceof Error ? error.message : t("tune.loadPlanFailed"));
      toast.error(t("tune.loadPlanFailed"));
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
        toast.success(response.encouragement || t("tune.letsPractice"));
      } else {
        throw new Error("No practice plan received");
      }
    } catch (error) {
      console.error("Error fetching practice plan:", error);
      setError(error instanceof Error ? error.message : t("tune.loadPlanFailed"));
      toast.error(t("tune.loadPlanFailed"));
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

    const sanitizedTargetSequence = sanitizeNoteSequence(targetSequence) ?? targetSequence;
    const sanitizedRecording = sanitizeNoteSequence(trimmedRecording) ?? trimmedRecording;

    // Don't change phase - stay on practice screen
    setIsEvaluating(true);
    
    // Increment eval index and track pending
    evalIndexRef.current += 1;
    const currentEvalIndex = evalIndexRef.current;
    setPendingEvalIndex(currentEvalIndex);

    try {
      if (debugMode) {
        const debugResponse = await evaluateAttempt.mutateAsync({
          tuneKey,
          nuggetId: currentNugget.itemId,
          userSequence: sanitizedRecording,
          localUserId,
          language,
          debug: true,
          evalIndex: currentEvalIndex,
        });

        setIsEvaluating(false);
        setPendingEvalIndex(undefined);
        setEvalDebugData({
          tuneKey,
          nuggetId: currentNugget.itemId,
          targetSequence: sanitizedTargetSequence,
          userSequence: sanitizedRecording,
          prompt: (debugResponse as any).prompt,
          request: (debugResponse as any).request,
        });
      } else {
        const response = await evaluateAttempt.mutateAsync({
          tuneKey,
          nuggetId: currentNugget.itemId,
          userSequence: sanitizedRecording,
          localUserId,
          language,
          debug: false,
          evalIndex: currentEvalIndex,
        });

        setIsEvaluating(false);
        setPendingEvalIndex(undefined);
        
        // Check if this response is stale
        if (response.evalIndex !== undefined && response.evalIndex < latestReceivedIndexRef.current) {
          console.log(`[TuneMode] Ignoring stale eval response (index ${response.evalIndex}, latest: ${latestReceivedIndexRef.current})`);
          return;
        }
        
        // Update latest received index
        latestReceivedIndexRef.current = Math.max(latestReceivedIndexRef.current, response.evalIndex ?? 0);
        
        // Update evaluation inline - no phase change
        updateEvaluation(response);

        // Celebratory toast for tune acquisition
        if (response.tuneAcquired) {
          toast.success(t("tune.tuneAcquired", { title: state.tuneTitle }));
        }

        // Celebratory toast for skill unlocks from tune
        if (response.awardedSkills && response.awardedSkills.length > 0) {
          const skillNames = response.awardedSkills.join(", ");
          toast.success(t("tune.skillUnlocked", { skills: skillNames }));
        }

        // Suggest moving to next nugget if streak threshold reached
        if (response.suggestNewNugget && state.currentIndex < state.practicePlan.length - 1) {
          toast.info(t("tune.nextSectionHint"), { duration: 4000 });
        }
      }
    } catch (error) {
      console.error("Error evaluating attempt:", error);
      setIsEvaluating(false);
      setPendingEvalIndex(undefined);
      toast.error(t("tune.evaluateFailed"));
    }
  };

  const proceedFromEvalDebug = async () => {
    if (!currentNugget || !lastProcessedRecording.current) return;

    setEvalDebugData(null);
    setIsEvaluating(true);
    
    // Use the same eval index that was used for the debug request
    const currentEvalIndex = evalIndexRef.current;
    setPendingEvalIndex(currentEvalIndex);

    try {
      const sanitizedRecording =
        sanitizeNoteSequence(lastProcessedRecording.current) ?? lastProcessedRecording.current;
      const response = await evaluateAttempt.mutateAsync({
        tuneKey,
        nuggetId: currentNugget.itemId,
        userSequence: sanitizedRecording,
        localUserId,
        language,
        debug: false,
        evalIndex: currentEvalIndex,
      });

      setIsEvaluating(false);
      setPendingEvalIndex(undefined);
      
      // Check if this response is stale
      if (response.evalIndex !== undefined && response.evalIndex < latestReceivedIndexRef.current) {
        console.log(`[TuneMode] Ignoring stale eval response (index ${response.evalIndex}, latest: ${latestReceivedIndexRef.current})`);
        return;
      }
      
      // Update latest received index
      latestReceivedIndexRef.current = Math.max(latestReceivedIndexRef.current, response.evalIndex ?? 0);
      
      updateEvaluation(response);
      
    } catch (error) {
      console.error("Error evaluating attempt:", error);
      setIsEvaluating(false);
      setPendingEvalIndex(undefined);
      toast.error("Failed to evaluate performance");
    }
  };

  const handlePlaySample = useCallback((markInteraction = false) => {
    if (markInteraction) {
      setHasUserInteracted(true);
    }
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
    setHasUserInteracted(true);
    nextNugget();
    lastProcessedRecording.current = currentRecording ?? null;
    setIsEvaluating(false);
    clearEvaluation();
    setAutoPlayTrigger((prev) => prev + 1);
    // Reset eval index tracking for new nugget
    evalIndexRef.current = 0;
    latestReceivedIndexRef.current = 0;
    setPendingEvalIndex(undefined);
    if (preEvalTimer.current) {
      clearTimeout(preEvalTimer.current);
      preEvalTimer.current = null;
    }
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, [nextNugget, currentRecording, clearEvaluation]);

  const handlePreviousNugget = useCallback(() => {
    if (state.currentIndex === 0) {
      return;
    }
    setHasUserInteracted(true);
    previousNugget();
    lastProcessedRecording.current = currentRecording ?? null;
    setIsEvaluating(false);
    clearEvaluation();
    setAutoPlayTrigger((prev) => prev + 1);
    // Reset eval index tracking for new nugget
    evalIndexRef.current = 0;
    latestReceivedIndexRef.current = 0;
    setPendingEvalIndex(undefined);
    if (preEvalTimer.current) {
      clearTimeout(preEvalTimer.current);
      preEvalTimer.current = null;
    }
    if (silenceTimer.current) {
      clearTimeout(silenceTimer.current);
      silenceTimer.current = null;
    }
  }, [previousNugget, currentRecording, clearEvaluation, state.currentIndex]);

  useEffect(() => {
    if (!currentNugget?.itemId) return;
    const autoPlayKey = `${currentNugget.itemId}:${autoPlayTrigger}`;
    if (lastAutoPlayKey.current === autoPlayKey) return;
    if (!hasUserInteracted || isPlayingSample || isRecording) return;
    lastAutoPlayKey.current = autoPlayKey;
    handlePlaySample();
  }, [currentNugget?.itemId, autoPlayTrigger, isPlayingSample, isRecording, handlePlaySample, hasUserInteracted]);

  // Render based on phase
  if (state.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6">
        <p className="text-destructive mb-4">{state.error}</p>
        <button onClick={onLeave} className="text-primary hover:underline">
          {t("tune.returnToSelection")}
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
        message={
          state.phase === "loading" ? t("tune.loadingTune") : t("tune.preparingPlan")
        }
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
        onPlaySample={() => handlePlaySample(true)}
        onSwitchNugget={handleSwitchNugget}
        onPreviousNugget={handlePreviousNugget}
        onLeave={onLeave}
        isPlaying={isPlayingSample}
        isEvaluating={isEvaluating}
        isRecording={isRecording}
        debugMode={debugMode}
        practicePlan={state.practicePlan}
        currentEvalIndex={state.currentEvalIndex}
        pendingEvalIndex={pendingEvalIndex}
        dspXml={dspXml}
        onRegisterNoteHandler={onRegisterNoteHandler}
        onRegisterNoteOffHandler={onRegisterNoteOffHandler}
      />
    );
  }

  // Fallback - practice plan exhausted, go back to coaching
  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <p className="text-foreground mb-4">{t("tune.practiceComplete")}</p>
      <button onClick={fetchPracticePlan} className="text-primary hover:underline">
        {t("tune.getNewPlan")}
      </button>
    </div>
  );
}
