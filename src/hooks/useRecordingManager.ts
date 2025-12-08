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
  recordingDelayMs?: number;
  minGapOnResumeMs?: number;
}

export function useRecordingManager({
  bpm,
  timeSignature,
  onRecordingComplete,
  recordingDelayMs = 3000,
  minGapOnResumeMs = 2000,
}: UseRecordingManagerOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(100);

  const recordingRef = useRef<NoteSequence>(createEmptyNoteSequence(bpm, timeSignature));
  const lastRecordingRef = useRef<RecordingResult | null>(null);
  const notePressDataRef = useRef<Map<string, { startTime: number; velocity: number }>>(new Map());
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const heldKeysCountRef = useRef(0);
  const lastNoteEndTimeRef = useRef<number | null>(null);

  // Store the callback in a ref to avoid stale closures in setTimeout
  const onRecordingCompleteRef = useRef(onRecordingComplete);
  onRecordingCompleteRef.current = onRecordingComplete;

  const startRecording = useCallback(() => {
    if (recordingStartTimeRef.current !== null) return; // Already recording

    recordingStartTimeRef.current = Date.now();
    recordingRef.current = createEmptyNoteSequence(bpm, timeSignature);
    lastNoteEndTimeRef.current = null;
    setIsRecording(true);
    
    console.log("[RecordingManager] Started recording");
  }, [bpm, timeSignature]);

  const completeRecording = useCallback(() => {
    if (recordingRef.current.notes.length === 0) return;

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
    normalizedRecording.notes.forEach((n, i) => {
      console.log(`  Note ${i}: start=${n.startTime.toFixed(3)}s, end=${n.endTime.toFixed(3)}s, duration=${(n.endTime - n.startTime).toFixed(3)}s`);
    });

    setShowProgress(true);
    setProgress(100);

    // Use ref to get latest callback - avoids stale closure
    onRecordingCompleteRef.current(result);
    
    // Reset recording state
    recordingRef.current = createEmptyNoteSequence(bpm, timeSignature);
    recordingStartTimeRef.current = null;
    lastNoteEndTimeRef.current = null;
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
  }, [bpm, timeSignature]);

  const addNoteStart = useCallback((noteKey: string, velocity: number = 0.8) => {
    if (recordingStartTimeRef.current === null) {
      startRecording();
    }

    heldKeysCountRef.current++;

    const now = Date.now();
    let startTimeSeconds = (now - recordingStartTimeRef.current!) / 1000;

    // When resuming after silence, ensure minimum gap from last note
    const wasWaitingToComplete = recordingTimeoutRef.current !== null;
    if (wasWaitingToComplete && lastNoteEndTimeRef.current !== null) {
      const minGapSeconds = minGapOnResumeMs / 1000;
      const minStartTime = lastNoteEndTimeRef.current + minGapSeconds;
      
      if (startTimeSeconds < minStartTime) {
        // Shift the recording start time backward to create the gap
        const offsetNeeded = minStartTime - startTimeSeconds;
        recordingStartTimeRef.current! -= offsetNeeded * 1000;
        startTimeSeconds = minStartTime;
        console.log(`[RecordingManager] Enforced ${minGapSeconds}s gap, new start time: ${startTimeSeconds.toFixed(3)}s`);
      }
    }

    notePressDataRef.current.set(noteKey, { startTime: startTimeSeconds, velocity });

    // Clear any pending recording timeout when new key is pressed
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    setShowProgress(false);
    setProgress(100);

    console.log(`[RecordingManager] Note start: ${noteKey} at ${startTimeSeconds.toFixed(3)}s`);
  }, [startRecording, minGapOnResumeMs]);

  const addNoteEnd = useCallback((noteKey: string): Note | null => {
    if (recordingStartTimeRef.current === null) return null;

    heldKeysCountRef.current = Math.max(0, heldKeysCountRef.current - 1);

    const pressData = notePressDataRef.current.get(noteKey);
    if (!pressData) return null;

    const now = Date.now();
    const endTimeSeconds = (now - recordingStartTimeRef.current) / 1000;

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
    lastNoteEndTimeRef.current = endTimeSeconds;

    notePressDataRef.current.delete(noteKey);

    // Only set recording timeout when all keys are released
    if (heldKeysCountRef.current === 0 && recordingRef.current.notes.length > 0) {
      recordingTimeoutRef.current = setTimeout(() => {
        completeRecording();
      }, recordingDelayMs);
    }

    return note;
  }, [recordingDelayMs, completeRecording]);

  const cancelRecording = useCallback(() => {
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    recordingRef.current = createEmptyNoteSequence(bpm, timeSignature);
    recordingStartTimeRef.current = null;
    lastNoteEndTimeRef.current = null;
    notePressDataRef.current.clear();
    heldKeysCountRef.current = 0;
    setIsRecording(false);
    setShowProgress(false);
    setProgress(100);
    
    console.log("[RecordingManager] Recording cancelled");
  }, [bpm, timeSignature]);

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

  return {
    isRecording,
    showProgress,
    progress,
    addNoteStart,
    addNoteEnd,
    cancelRecording,
    restoreLastRecording,
    hideProgress,
    completeRecording,
  };
}
