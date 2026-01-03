import { NoteSequence } from "@/types/noteSequence";
import { STORAGE_KEYS } from "./storageKeys";

const MAX_HISTORY_PER_LESSON = 10;

interface SequenceHistory {
  [lessonKey: string]: NoteSequence[];
}

/**
 * Get sequence history for a specific lesson key
 */
export function getSequenceHistory(lessonKey: string): NoteSequence[] {
  try {
    const item = window.localStorage.getItem(STORAGE_KEYS.LESSON_SEQUENCE_HISTORY);
    if (!item) return [];
    
    const history: SequenceHistory = JSON.parse(item);
    return history[lessonKey] || [];
  } catch (error) {
    console.warn(`Error reading sequence history for lesson "${lessonKey}":`, error);
    return [];
  }
}

/**
 * Add a sequence to the history for a lesson key
 * Limits history to MAX_HISTORY_PER_LESSON to prevent localStorage overflow
 */
export function addSequenceToHistory(lessonKey: string, sequence: NoteSequence): void {
  try {
    const item = window.localStorage.getItem(STORAGE_KEYS.LESSON_SEQUENCE_HISTORY);
    const history: SequenceHistory = item ? JSON.parse(item) : {};
    
    if (!history[lessonKey]) {
      history[lessonKey] = [];
    }
    
    // Add new sequence at the beginning (most recent first)
    history[lessonKey].unshift(sequence);
    
    // Limit history to MAX_HISTORY_PER_LESSON
    if (history[lessonKey].length > MAX_HISTORY_PER_LESSON) {
      history[lessonKey] = history[lessonKey].slice(0, MAX_HISTORY_PER_LESSON);
    }
    
    window.localStorage.setItem(STORAGE_KEYS.LESSON_SEQUENCE_HISTORY, JSON.stringify(history));
  } catch (error) {
    console.warn(`Error adding sequence to history for lesson "${lessonKey}":`, error);
  }
}

/**
 * Clear sequence history for a specific lesson key, or all lessons if no key provided
 */
export function clearSequenceHistory(lessonKey?: string): void {
  try {
    if (lessonKey) {
      // Clear history for specific lesson
      const item = window.localStorage.getItem(STORAGE_KEYS.LESSON_SEQUENCE_HISTORY);
      if (!item) return;
      
      const history: SequenceHistory = JSON.parse(item);
      delete history[lessonKey];
      
      window.localStorage.setItem(STORAGE_KEYS.LESSON_SEQUENCE_HISTORY, JSON.stringify(history));
    } else {
      // Clear all history
      window.localStorage.removeItem(STORAGE_KEYS.LESSON_SEQUENCE_HISTORY);
    }
  } catch (error) {
    console.warn(`Error clearing sequence history${lessonKey ? ` for lesson "${lessonKey}"` : ""}:`, error);
  }
}

