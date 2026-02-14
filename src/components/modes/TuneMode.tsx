import { DebugLLMSheet } from "@/components/DebugLLMSheet";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import {
  useEvaluateTuneAttempt,
  useStartTunePractice,
  useTuneAssets,
} from "@/hooks/useTuneQueries";
import { useTuneState } from "@/hooks/useTuneState";
import type {
  TuneEvaluationDebugData,
} from "@/types/tunePractice";
import type { INoteSequence } from "@magenta/music/es6";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TunePractice } from "./TunePractice";

export interface TuneDebugMenuState {
  evalIndex?: number;
  currentEvalIndex?: number;
  evalDecision?: string | null;
  hasPracticePlan: boolean;
  hasCoachPrompt?: boolean;
  openPlanSheet: () => void;
  openEvalDebug: () => void;
  openCoachPrompt?: () => void;
}

interface TuneModeProps {
  tuneKey: string;
  localUserId?: string | null;
  language?: string;
  notationPreference?: "auto" | "abc" | "solfege";
  debugMode?: boolean;
  onLeave: () => void;
  onPlaySample: (sequence: INoteSequence) => void;
  isPlayingSample?: boolean;
  currentRecording?: INoteSequence | null;
  isRecording?: boolean;
  onRegisterNoteHandler?: (handler: ((noteKey: string) => void) | null) => void;
  onRegisterNoteOffHandler?: (
    handler: ((noteKey: string) => void) | null,
  ) => void;
  onClearRecording?: () => void;
  /** When playhead reaches end of track (user-driven), parent completes recording; we then send. */
  onPlayheadReachedEnd?: () => void;
  onTuneDebugMenuChange?: (menu: TuneDebugMenuState | null) => void;
}

export function TuneMode({
  tuneKey,
  localUserId,
  language = "en",
  notationPreference = "auto",
  debugMode = false,
  onLeave,
  onPlaySample,
  isPlayingSample = false,
  currentRecording,
  isRecording = false,
  onRegisterNoteHandler,
  onRegisterNoteOffHandler,
  onClearRecording,
  onPlayheadReachedEnd,
  onTuneDebugMenuChange,
}: TuneModeProps) {
  const { t } = useTranslation();
  const {
    state,
    currentNugget,
    setPhase,
    setPracticePlan,
    updateEvaluation,
    clearEvaluation,
    nextNugget,
    previousNugget,
    setError,
  } = useTuneState(tuneKey);

  const startPractice = useStartTunePractice();
  const evaluateAttempt = useEvaluateTuneAttempt();
  const { data: tuneAssets } = useTuneAssets(tuneKey);

  const [coachDebugCall, setCoachDebugCall] = useState<{ request?: string; response?: string } | null>(null);
  const [showCoachPromptSheet, setShowCoachPromptSheet] = useState(false);
  const [evalDebugData, setEvalDebugData] =
    useState<TuneEvaluationDebugData | null>(null);
  const [lastEvalPrompt, setLastEvalPrompt] = useState<string | null>(null);
  const [lastEvalAnswer, setLastEvalAnswer] = useState<string | null>(null);
  const [lastEvalDecision, setLastEvalDecision] = useState<string | null>(null);
  const [autoPlayTrigger, setAutoPlayTrigger] = useState(0);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Sheet state (lifted from TunePractice so the action bar dropdown can open them)
  const [showPlanSheet, setShowPlanSheet] = useState(false);
  const [showEvalDebug, setShowEvalDebug] = useState(false);

  // Report debug menu state to parent (for action bar dropdown)
  useEffect(() => {
    if (!onTuneDebugMenuChange || !debugMode) return;
    onTuneDebugMenuChange({
      evalIndex: state.lastEvaluation?.evalIndex,
      currentEvalIndex: state.currentEvalIndex,
      evalDecision: lastEvalDecision,
      hasPracticePlan: state.practicePlan.length > 0,
      hasCoachPrompt: !!(coachDebugCall?.request || coachDebugCall?.response),
      openPlanSheet: () => setShowPlanSheet(true),
      openEvalDebug: () => setShowEvalDebug(true),
      openCoachPrompt: () => setShowCoachPromptSheet(true),
    });
  }, [
    onTuneDebugMenuChange,
    debugMode,
    state.lastEvaluation?.evalIndex,
    state.currentEvalIndex,
    lastEvalDecision,
    state.practicePlan.length,
    coachDebugCall,
  ]);

  // Clear debug menu on unmount
  useEffect(() => {
    return () => onTuneDebugMenuChange?.(null);
  }, [onTuneDebugMenuChange]);

  // Track if we've processed the current recording
  const lastProcessedRecording = useRef<INoteSequence | null>(null);
  const lastProcessedSignatureRef = useRef<string | null>(null);
  const lastProcessedRecordingIdRef = useRef<string | null>(null);
  const lastAutoPlayKey = useRef<string | null>(null);

  // Evaluation indexing to handle out-of-order responses
  const evalIndexRef = useRef(0);
  const latestReceivedIndexRef = useRef(0);
  const [pendingEvalIndex, setPendingEvalIndex] = useState<number | undefined>(
    undefined,
  );

  // Track evaluation state for inline indicator
  const [isEvaluating, setIsEvaluating] = useState(false);

  const sanitizeNoteSequence = (
    sequence?: INoteSequence | null,
  ): INoteSequence | undefined => {
    if (!sequence) return undefined;
    const notes = (sequence.notes || []).map((note) => ({
      pitch: note.pitch,
      startTime: note.startTime,
      endTime: note.endTime,
    }));
    return { ...sequence, notes };
  };

  const getRecordingStats = useCallback((recording: INoteSequence) => {
    const notes = recording.notes ?? [];
    const noteCount = notes.length;
    const fallbackTotalTime =
      notes.length > 0
        ? Math.max(...notes.map((n) => n.endTime ?? n.startTime ?? 0))
        : 0;
    const totalTime =
      typeof recording.totalTime === "number" && recording.totalTime > 0
        ? recording.totalTime
        : fallbackTotalTime;
    return { noteCount, totalTime };
  }, []);

  const getRecordingSignature = useCallback(
    (recording: INoteSequence) => {
      const notes = recording.notes ?? [];
      const firstStart = notes[0]?.startTime ?? 0;
      const lastEnd =
        notes[notes.length - 1]?.endTime ??
        notes[notes.length - 1]?.startTime ??
        0;
      const { noteCount, totalTime } = getRecordingStats(recording);
      return `${noteCount}:${totalTime.toFixed(3)}:${firstStart.toFixed(3)}:${lastEnd.toFixed(3)}`;
    },
    [getRecordingStats],
  );

  const getRecordingId = useCallback((recording?: INoteSequence | null) => {
    if (!recording) return null;
    return (
      (recording as INoteSequence & { recordingId?: string }).recordingId ??
      null
    );
  }, []);

  const handleEvaluate = useCallback(
    async (recording: INoteSequence) => {
      if (!currentNugget) return;

      // Get the note sequence from nugget, assembly, or full tune
      const targetSequence = (currentNugget.nugget?.noteSequence ||
        currentNugget.assembly?.noteSequence ||
        currentNugget.fullTune?.noteSequence) as INoteSequence | undefined;
      const targetNoteCount = targetSequence?.notes?.length || 8;
      const maxNotes = targetNoteCount * 2;

      let trimmedRecording = recording;
      if (recording.notes && recording.notes.length > maxNotes) {
        const trimmedNotes = recording.notes.slice(-maxNotes); // Keep LAST notes
        trimmedRecording = {
          ...recording,
          notes: trimmedNotes,
          totalTime:
            trimmedNotes.length > 0
              ? Math.max(...trimmedNotes.map((n) => n.endTime || 0))
              : 0,
        };
        console.log(
          `[TuneMode] Trimmed recording from ${recording.notes.length} to ${trimmedNotes.length} notes (target: ${targetNoteCount})`,
        );
      }

      const sanitizedTargetSequence =
        sanitizeNoteSequence(targetSequence) ?? targetSequence;
      const sanitizedRecording =
        sanitizeNoteSequence(trimmedRecording) ?? trimmedRecording;

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
            notationPreference,
            debug: true,
            evalIndex: currentEvalIndex,
          });

          setEvalDebugData({
            tuneKey,
            nuggetId: currentNugget.itemId,
            targetSequence: sanitizedTargetSequence,
            userSequence: sanitizedRecording,
            prompt: (debugResponse as any).prompt,
            request: (debugResponse as any).request,
          });
          const promptText =
            (debugResponse as { prompt?: string }).prompt ||
            JSON.stringify(
              (debugResponse as { request?: unknown }).request,
              null,
              2,
            );
          setLastEvalPrompt(promptText ?? null);

          const response = await evaluateAttempt.mutateAsync({
            tuneKey,
            nuggetId: currentNugget.itemId,
            userSequence: sanitizedRecording,
            localUserId,
            language,
            notationPreference,
            debug: false,
            evalIndex: currentEvalIndex,
          });

          setIsEvaluating(false);
          setPendingEvalIndex(undefined);

          // Check if this response is stale
          if (response.evalIndex === undefined) {
            console.warn("[TuneMode] Eval response missing evalIndex.");
          } else if (response.evalIndex < latestReceivedIndexRef.current) {
            console.log(
              `[TuneMode] Ignoring stale eval response (index ${response.evalIndex}, latest: ${latestReceivedIndexRef.current})`,
            );
            return;
          }

          // Update latest received index
          latestReceivedIndexRef.current = Math.max(
            latestReceivedIndexRef.current,
            response.evalIndex ?? 0,
          );

          // Update evaluation inline - no phase change
          updateEvaluation(response);
          setLastEvalAnswer(JSON.stringify(response, null, 2));
          onClearRecording?.();

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
          if (
            response.suggestNewNugget &&
            state.currentIndex < state.practicePlan.length - 1
          ) {
            toast.info(t("tune.nextSectionHint"), { duration: 4000 });
          }
        } else {
          const response = await evaluateAttempt.mutateAsync({
            tuneKey,
            nuggetId: currentNugget.itemId,
            userSequence: sanitizedRecording,
            localUserId,
            language,
            notationPreference,
            debug: false,
            evalIndex: currentEvalIndex,
          });

          setIsEvaluating(false);
          setPendingEvalIndex(undefined);

          // Check if this response is stale
          if (response.evalIndex === undefined) {
            console.warn("[TuneMode] Eval response missing evalIndex.");
          } else if (response.evalIndex < latestReceivedIndexRef.current) {
            console.log(
              `[TuneMode] Ignoring stale eval response (index ${response.evalIndex}, latest: ${latestReceivedIndexRef.current})`,
            );
            return;
          }

          // Update latest received index
          latestReceivedIndexRef.current = Math.max(
            latestReceivedIndexRef.current,
            response.evalIndex ?? 0,
          );

          // Update evaluation inline - no phase change
          updateEvaluation(response);
          setLastEvalAnswer(JSON.stringify(response, null, 2));
          onClearRecording?.();

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
          if (
            response.suggestNewNugget &&
            state.currentIndex < state.practicePlan.length - 1
          ) {
            toast.info(t("tune.nextSectionHint"), { duration: 4000 });
          }
        }
      } catch (error) {
        console.error("Error evaluating attempt:", error);
        setIsEvaluating(false);
        setPendingEvalIndex(undefined);
        toast.error(t("tune.evaluateFailed"));
      }
    },
    [
      debugMode,
      tuneKey,
      currentNugget,
      localUserId,
      language,
      evaluateAttempt,
      updateEvaluation,
      onClearRecording,
      state.tuneTitle,
      state.currentIndex,
      state.practicePlan.length,
      t,
    ],
  );

  // Send for evaluation when recording completes (playhead reached end → parent called completeNow)
  useEffect(() => {
    if (isRecording) {
      setIsEvaluating(false);
      return;
    }

    if (
      !currentRecording ||
      currentRecording === lastProcessedRecording.current ||
      state.phase !== "practicing" ||
      !currentNugget
    ) {
      return;
    }

    const recordingId = getRecordingId(currentRecording);
    const signature = getRecordingSignature(currentRecording);
    if (recordingId && lastProcessedRecordingIdRef.current === recordingId)
      return;
    if (!recordingId && lastProcessedSignatureRef.current === signature)
      return;

    const targetSequence = (currentNugget.nugget?.noteSequence ||
      currentNugget.assembly?.noteSequence ||
      currentNugget.fullTune?.noteSequence) as INoteSequence | undefined;
    const targetNoteCount = targetSequence?.notes?.length || 8;
    const minNotes = Math.min(
      targetNoteCount,
      Math.max(2, Math.ceil(targetNoteCount * 0.5)),
    );
    const minDurationSec = 0.3;
    const { noteCount, totalTime } = getRecordingStats(currentRecording);
    const shouldSend = noteCount >= minNotes && totalTime >= minDurationSec;
    const decision = `rec=${recordingId ?? "none"} notes ${noteCount}/${targetNoteCount}, duration ${totalTime.toFixed(2)}s (min ${minNotes}, ${minDurationSec}s) -> ${shouldSend ? "send" : "skip"}`;
    setLastEvalDecision(decision);
    if (debugMode) {
      console.log(`[TuneMode] Eval gate: ${decision}`);
    }
    lastProcessedSignatureRef.current = signature;
    lastProcessedRecordingIdRef.current = recordingId;
    lastProcessedRecording.current = currentRecording;

    if (!shouldSend) return;

    setIsEvaluating(true);
    handleEvaluate(currentRecording);
  }, [
    isRecording,
    currentRecording,
    state.phase,
    currentNugget,
    debugMode,
    getRecordingId,
    getRecordingSignature,
    getRecordingStats,
    handleEvaluate,
  ]);

  // Initial load - fetch practice plan
  useEffect(() => {
    if (state.phase === "loading") {
      fetchPracticePlan();
    }
  }, [state.phase]);

  // Track whether this is a regeneration (plan was exhausted)
  const isRegeneration =
    state.practicePlan.length === 0 &&
    state.currentIndex === 0 &&
    state.phase === "loading";

  const fetchPracticePlan = async () => {
    try {
      setPhase("coaching");

      // Always proceed directly with the real call
      const response = await startPractice.mutateAsync({
        tuneKey,
        localUserId,
        language,
        notationPreference,
        debug: false,
      });

      if (response.practicePlan && response.practicePlan.length > 0) {
        setPracticePlan(response.practicePlan, response.tuneTitle);
        // Show different message for regeneration vs first load
        toast.success(
          isRegeneration
            ? t("tune.planReady")
            : response.encouragement || t("tune.letsPractice"),
        );
      } else {
        throw new Error("No practice plan received");
      }

      // In debug mode, capture the response and fire a parallel call for the request
      if (debugMode) {
        // Save the normal response
        setCoachDebugCall((prev) => ({
          ...prev,
          response: JSON.stringify(response, null, 2),
        }));

        // Fire a parallel call to capture the coach prompt (non-blocking)
        startPractice.mutateAsync({
          tuneKey,
          localUserId,
          language,
          notationPreference,
          debug: true,
        }).then((debugResponse) => {
          const promptText = (debugResponse as any).prompt;
          if (promptText) {
            setCoachDebugCall((prev) => ({
              ...prev,
              request: promptText,
            }));
          }
        }).catch((err) => {
          console.error("Failed to fetch coach debug prompt:", err);
        });
      }
    } catch (error) {
      console.error("Error fetching practice plan:", error);
      setError(
        error instanceof Error ? error.message : t("tune.loadPlanFailed"),
      );
      toast.error(t("tune.loadPlanFailed"));
    }
  };

  const handlePlaySample = useCallback(
    (markInteraction = false) => {
      if (markInteraction) {
        setHasUserInteracted(true);
      }
      // Reset recording state when playing sample
      lastProcessedRecording.current = null;
      setIsEvaluating(false);

      // Get note sequence from nugget, assembly, or full tune
      const noteSequence =
        currentNugget?.nugget?.noteSequence ||
        currentNugget?.assembly?.noteSequence ||
        currentNugget?.fullTune?.noteSequence;
      if (noteSequence) {
        onPlaySample(noteSequence as INoteSequence);
      }
    },
    [currentNugget, onPlaySample],
  );

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
    setLastEvalPrompt(null);
    setLastEvalAnswer(null);
    setLastEvalDecision(null);
    setEvalDebugData(null);
    lastProcessedRecordingIdRef.current = null;
    lastProcessedSignatureRef.current = null;
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
    setLastEvalPrompt(null);
    setLastEvalAnswer(null);
    setLastEvalDecision(null);
    setEvalDebugData(null);
    lastProcessedRecordingIdRef.current = null;
    lastProcessedSignatureRef.current = null;
  }, [previousNugget, currentRecording, clearEvaluation, state.currentIndex]);

  useEffect(() => {
    if (!currentNugget?.itemId) return;
    const autoPlayKey = `${currentNugget.itemId}:${autoPlayTrigger}`;
    if (lastAutoPlayKey.current === autoPlayKey) return;
    if (!hasUserInteracted || isPlayingSample || isRecording) return;
    lastAutoPlayKey.current = autoPlayKey;
    handlePlaySample();
  }, [
    currentNugget?.itemId,
    autoPlayTrigger,
    isPlayingSample,
    isRecording,
    handlePlaySample,
    hasUserInteracted,
  ]);

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

  // Loading states
  if (state.phase === "loading" || state.phase === "coaching") {
    return (
      <LoadingSpinner
        message={
          state.phase === "loading"
            ? t("tune.loadingTune")
            : t("tune.preparingPlan")
        }
      />
    );
  }

  // Practice phase - THE MAIN CONTINUOUS SCREEN
  if (state.phase === "practicing" && currentNugget) {
    return (
      <>
        <TunePractice
          tuneTitle={state.tuneTitle}
          currentNugget={currentNugget}
          currentIndex={state.currentIndex}
          totalNuggets={state.practicePlan.length}
          currentStreak={state.currentStreak}
          totalWins={state.totalWins}
          lastEvaluation={state.lastEvaluation}
          onPlaySample={() => handlePlaySample(true)}
          onSwitchNugget={handleSwitchNugget}
          onPreviousNugget={handlePreviousNugget}
          onLeave={onLeave}
          isPlaying={isPlayingSample}
          isEvaluating={isEvaluating}
          isRecording={isRecording}
          onPlayheadReachedEnd={onPlayheadReachedEnd}
          debugMode={debugMode}
          practicePlan={state.practicePlan}
          currentEvalIndex={state.currentEvalIndex}
          pendingEvalIndex={pendingEvalIndex}
          onRegisterNoteHandler={onRegisterNoteHandler}
          onRegisterNoteOffHandler={onRegisterNoteOffHandler}
          evalPrompt={lastEvalPrompt}
          evalAnswer={lastEvalAnswer}
          evalDecision={lastEvalDecision}
          evalDebugData={evalDebugData}
          showPlanSheet={showPlanSheet}
          onShowPlanSheetChange={setShowPlanSheet}
          showEvalDebug={showEvalDebug}
          onShowEvalDebugChange={setShowEvalDebug}
        />
        {/* Coach LLM Call Sheet (opened from action bar debug dropdown) */}
        <DebugLLMSheet
          title="Coach LLM Call"
          open={showCoachPromptSheet}
          onOpenChange={setShowCoachPromptSheet}
          debugCall={coachDebugCall ?? undefined}
        />
      </>
    );
  }

  // Fallback - practice plan exhausted, go back to coaching
  return (
    <div className="flex flex-col items-center justify-center h-full p-6">
      <p className="text-foreground mb-4">{t("tune.practiceComplete")}</p>
      <button
        onClick={fetchPracticePlan}
        className="text-primary hover:underline"
      >
        {t("tune.getNewPlan")}
      </button>
    </div>
  );
}
