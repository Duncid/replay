import { useRef, useCallback, useState } from "react";
import { NoteSequence, Note } from "@/types/noteSequence";
import { noteNameToMidi, createEmptyNoteSequence } from "@/utils/noteSequenceUtils";

export interface RecordingNote {
  noteKey: string;
  pitch: number;
  startTime: number;
  velocity: number;
}

export interface RecordingResult {
  sequence: NoteSequence;
  recordingStartTime: number;
}

interface UseRecordingManagerOptions {
  bpm: number;
  timeSignature: string;
  onRecordingComplete: (result: RecordingResult) => void;
  onRecordingUpdate?: (notes: Note[]) => void; // For live display
  pauseTimeoutMs?: number; // Time of silence before timeline pauses (default: 3000ms)
  resumeGapMs?: number; // Gap to add when resuming after pause (default: 1000ms)
}

export function useRecordingManager({
  bpm,
  timeSignature,
  onRecordingComplete,
  onRecordingUpdate,
  pauseTimeoutMs = 3000,
  resumeGapMs = 1000,
}: UseRecordingManagerOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(100);
  const [showEndingProgress, setShowEndingProgress] = useState(false);
  const [endingProgress, setEndingProgress] = useState(100);

  const recordingRef = useRef<NoteSequence>(createEmptyNoteSequence(bpm, timeSignature));
  const lastRecordingRef = useRef<RecordingResult | null>(null);
  const notePressDataRef = useRef<Map<string, { startTime: number; velocity: number }>>(new Map());
  const recordingStartTimeRef = useRef<number | null>(null);
  const heldKeysCountRef = useRef(0);

  // Virtual timeline state
  const virtualTimeRef = useRef<number>(0); // Current position in virtual timeline
  const timelinePausedRef = useRef<boolean>(false); // Whether timeline is paused after 3s silence
  const lastNoteEndTimeRef = useRef<number>(0); // End time of last completed note
  const realTimeAtPauseRef = useRef<number>(0); // Real time when timeline was paused

  // Timeouts
  const pauseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const completionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const endingProgressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Store the callback in a ref to avoid stale closures in setTimeout
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  onRecordingCompleteRef.current = onRecordingComplete;
  const onRecordingUpdateRef = useRef(onRecordingUpdate);
  onRecordingUpdateRef.current = onRecordingUpdate;

  const clearEndingProgress = useCallback(() => {
    if (endingProgressIntervalRef.current) {
      clearInterval(endingProgressIntervalRef.current);
      endingProgressIntervalRef.current = null;
    }
    setShowEndingProgress(false);
    setEndingProgress(100);
  }, []);

  const clearAllTimeouts = useCallback(() => {
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    clearEndingProgress();
  }, [clearEndingProgress]);

  const completeRecording = useCallback(() => {
    if (recordingRef.current.notes.length === 0) return;

    clearAllTimeouts();

    // Normalize recording so first note starts at 0
    const minTime = Math.min(...recordingRef.current.notes.map(n => n.startTime));
    const normalizedNotes = recordingRef.current.notes.map(n => ({
      ...n,
      startTime: n.startTime - minTime,
      endTime: n.endTime - minTime,
    }));
    const normalizedRecording: NoteSequence = {
      ...recordingRef.current,
      notes: normalizedNotes,
      totalTime: recordingRef.current.totalTime - minTime,
    };

    // Save recording before sending
    const result: RecordingResult = {
      sequence: { ...normalizedRecording, notes: [...normalizedRecording.notes] },
      recordingStartTime: recordingStartTimeRef.current!,
    };
    lastRecordingRef.current = result;

    console.log(`[RecordingManager] Recording complete: ${normalizedRecording.notes.length} notes, totalTime: ${normalizedRecording.totalTime.toFixed(3)}s`);

    setShowProgress(true);
    setProgress(100);

    // Use ref to get latest callback
    onRecordingCompleteRef.current(result);
    
    // Reset recording state
    recordingRef.current = createEmptyNoteSequence(bpm, timeSignature);
    recordingStartTimeRef.current = null;
    virtualTimeRef.current = 0;
    timelinePausedRef.current = false;
    lastNoteEndTimeRef.current = 0;
    setIsRecording(false);

    // Start progress animation
    const startTime = Date.now();
    progressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.max(0, 100 - (elapsed / 1000) * 100);
      setProgress(newProgress);
      if (newProgress === 0 && progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
    }, 16);
  }, [bpm, timeSignature, clearAllTimeouts]);

  const startPauseTimeout = useCallback(() => {
    // Clear existing timeouts
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
    }
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
    }
    clearEndingProgress();

    // Start the ending progress bar immediately
    setShowEndingProgress(true);
    setEndingProgress(100);
    const endingStartTime = Date.now();
    endingProgressIntervalRef.current = setInterval(() => {
      const elapsed = Date.now() - endingStartTime;
      const newProgress = Math.max(0, 100 - (elapsed / pauseTimeoutMs) * 100);
      setEndingProgress(newProgress);
      if (newProgress <= 0 && endingProgressIntervalRef.current) {
        clearInterval(endingProgressIntervalRef.current);
        endingProgressIntervalRef.current = null;
      }
    }, 16);

    // After pauseTimeoutMs of silence, pause the timeline
    pauseTimeoutRef.current = setTimeout(() => {
      timelinePausedRef.current = true;
      virtualTimeRef.current = lastNoteEndTimeRef.current;
      realTimeAtPauseRef.current = Date.now();
      setShowEndingProgress(false);
      console.log(`[RecordingManager] Timeline paused at ${virtualTimeRef.current.toFixed(3)}s`);

      // After another pauseTimeoutMs, complete the recording
      completionTimeoutRef.current = setTimeout(() => {
        if (recordingRef.current.notes.length > 0) {
          completeRecording();
        }
      }, pauseTimeoutMs);
    }, pauseTimeoutMs);
  }, [pauseTimeoutMs, completeRecording, clearEndingProgress]);

  const getCurrentVirtualTime = useCallback((): number => {
    if (!recordingStartTimeRef.current) return 0;

    if (timelinePausedRef.current) {
      // Timeline is paused - resume at lastNoteEndTime + resumeGap
      const resumeTime = lastNoteEndTimeRef.current + (resumeGapMs / 1000);
      console.log(`[RecordingManager] Resuming timeline at ${resumeTime.toFixed(3)}s (was paused at ${virtualTimeRef.current.toFixed(3)}s)`);
      
      // Unpause and update the reference point for real time
      timelinePausedRef.current = false;
      // Adjust recording start time so that current real time maps to resumeTime
      recordingStartTimeRef.current = Date.now() - (resumeTime * 1000);
      virtualTimeRef.current = resumeTime;
      return resumeTime;
    }

    // Timeline is running - use real elapsed time
    return (Date.now() - recordingStartTimeRef.current) / 1000;
  }, [resumeGapMs]);

  const startRecording = useCallback(() => {
    if (recordingStartTimeRef.current !== null) return; // Already recording

    recordingStartTimeRef.current = Date.now();
    recordingRef.current = createEmptyNoteSequence(bpm, timeSignature);
    virtualTimeRef.current = 0;
    timelinePausedRef.current = false;
    lastNoteEndTimeRef.current = 0;
    setIsRecording(true);
    
    console.log("[RecordingManager] Started recording");
  }, [bpm, timeSignature]);

  const addNoteStart = useCallback((noteKey: string, velocity: number = 0.8) => {
    if (recordingStartTimeRef.current === null) {
      startRecording();
    }

    heldKeysCountRef.current++;

    // Clear timeouts - user is playing again
    if (pauseTimeoutRef.current) {
      clearTimeout(pauseTimeoutRef.current);
      pauseTimeoutRef.current = null;
    }
    if (completionTimeoutRef.current) {
      clearTimeout(completionTimeoutRef.current);
      completionTimeoutRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setShowProgress(false);
    setProgress(100);

    const startTimeSeconds = getCurrentVirtualTime();

    notePressDataRef.current.set(noteKey, { startTime: startTimeSeconds, velocity });

    console.log(`[RecordingManager] Note start: ${noteKey} at ${startTimeSeconds.toFixed(3)}s`);
  }, [startRecording, getCurrentVirtualTime]);

  const addNoteEnd = useCallback((noteKey: string): Note | null => {
    if (recordingStartTimeRef.current === null) return null;

    heldKeysCountRef.current = Math.max(0, heldKeysCountRef.current - 1);

    const pressData = notePressDataRef.current.get(noteKey);
    if (!pressData) return null;

    const endTimeSeconds = getCurrentVirtualTime();

    const pitch = noteNameToMidi(noteKey);
    const note: Note = {
      pitch,
      startTime: pressData.startTime,
      endTime: endTimeSeconds,
      velocity: pressData.velocity,
    };

    console.log(`[RecordingManager] Note end: ${noteKey}, start=${pressData.startTime.toFixed(3)}s, end=${endTimeSeconds.toFixed(3)}s, duration=${(endTimeSeconds - pressData.startTime).toFixed(3)}s`);

    recordingRef.current.notes.push(note);
    recordingRef.current.totalTime = Math.max(recordingRef.current.totalTime, endTimeSeconds);
    lastNoteEndTimeRef.current = Math.max(lastNoteEndTimeRef.current, endTimeSeconds);
    virtualTimeRef.current = endTimeSeconds;

    notePressDataRef.current.delete(noteKey);

    // Notify for live display
    if (onRecordingUpdateRef.current) {
      onRecordingUpdateRef.current([...recordingRef.current.notes]);
    }

    // Start pause timeout when all keys are released
    if (heldKeysCountRef.current === 0 && recordingRef.current.notes.length > 0) {
      startPauseTimeout();
    }

    return note;
  }, [getCurrentVirtualTime, startPauseTimeout]);

  const cancelRecording = useCallback(() => {
    clearAllTimeouts();
    recordingRef.current = createEmptyNoteSequence(bpm, timeSignature);
    recordingStartTimeRef.current = null;
    virtualTimeRef.current = 0;
    timelinePausedRef.current = false;
    lastNoteEndTimeRef.current = 0;
    notePressDataRef.current.clear();
    heldKeysCountRef.current = 0;
    setIsRecording(false);
    setShowProgress(false);
    setProgress(100);
    
    console.log("[RecordingManager] Recording cancelled");
  }, [bpm, timeSignature, clearAllTimeouts]);

  const restoreLastRecording = useCallback(() => {
    if (lastRecordingRef.current) {
      recordingRef.current = { 
        ...lastRecordingRef.current.sequence, 
        notes: [...lastRecordingRef.current.sequence.notes] 
      };
      recordingStartTimeRef.current = lastRecordingRef.current.recordingStartTime;
      setIsRecording(true);
      console.log("[RecordingManager] Restored last recording with", recordingRef.current.notes.length, "notes");
    }
  }, []);

  const hideProgress = useCallback(() => {
    setShowProgress(false);
    setProgress(100);
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
  }, []);

  const getCurrentNotes = useCallback((): Note[] => {
    return [...recordingRef.current.notes];
  }, []);

  return {
    isRecording,
    showProgress,
    progress,
    showEndingProgress,
    endingProgress,
    addNoteStart,
    addNoteEnd,
    cancelRecording,
    restoreLastRecording,
    hideProgress,
    completeRecording,
    getCurrentNotes,
  };
}