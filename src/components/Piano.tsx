import { useState, useEffect, useRef, forwardRef, useImperativeHandle } from "react";
import { PianoKey } from "./PianoKey";

interface Note {
  note: string;
  octave: number;
  frequency: number;
  isBlack: boolean;
}

interface PianoProps {
  onUserPlay: (notes: string[]) => void;
  activeKeys: Set<string>;
  aiPlaying: boolean;
}

export interface PianoHandle {
  playNote: (frequency: number, duration?: number) => void;
}

const Piano = forwardRef<PianoHandle, PianoProps>(({ onUserPlay, activeKeys, aiPlaying }, ref) => {
  const [userPressedKeys, setUserPressedKeys] = useState<Set<string>>(new Set());
  const [showProgress, setShowProgress] = useState(false);
  const [progress, setProgress] = useState(100);
  const audioContextRef = useRef<AudioContext | null>(null);
  const recordingRef = useRef<string[]>([]);
  const recordingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 37 keys: C3 to C6 (3 octaves + 1 key)
  const notes: Note[] = [];
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  
  // Generate 37 keys starting from C3
  for (let i = 0; i < 37; i++) {
    const octave = Math.floor(i / 12) + 3;
    const noteIndex = i % 12;
    const noteName = noteNames[noteIndex];
    const isBlack = noteName.includes("#");
    
    // Calculate frequency: f = 440 * 2^((n-49)/12) where A4 = 440Hz
    const semitonesFromA4 = (octave - 4) * 12 + (noteIndex - 9);
    const frequency = 440 * Math.pow(2, semitonesFromA4 / 12);
    
    notes.push({
      note: noteName,
      octave,
      frequency,
      isBlack,
    });
  }

  useEffect(() => {
    audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    playNote,
  }));

  const playNote = (frequency: number, duration: number = 0.3) => {
    if (!audioContextRef.current) return;

    const audioContext = audioContextRef.current;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";

    // ADSR envelope for more realistic piano sound
    const now = audioContext.currentTime;
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(0.3, now + 0.01); // Attack
    gainNode.gain.linearRampToValueAtTime(0.2, now + 0.05); // Decay
    gainNode.gain.setValueAtTime(0.2, now + duration - 0.1); // Sustain
    gainNode.gain.linearRampToValueAtTime(0, now + duration); // Release

    oscillator.start(now);
    oscillator.stop(now + duration);
  };

  const handleKeyPress = (noteKey: string, frequency: number) => {
    if (aiPlaying) return; // Don't allow user input while AI is playing

    playNote(frequency);
    
    const newKeys = new Set(userPressedKeys);
    newKeys.add(noteKey);
    setUserPressedKeys(newKeys);

    // Add to recording
    recordingRef.current.push(noteKey);

    // Clear existing timeouts and intervals
    if (recordingTimeoutRef.current) {
      clearTimeout(recordingTimeoutRef.current);
    }
    if (progressTimeoutRef.current) {
      clearTimeout(progressTimeoutRef.current);
    }
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
    }
    
    // Hide progress bar and reset
    setShowProgress(false);
    setProgress(100);

    // After 1 second of silence, start showing the countdown
    progressTimeoutRef.current = setTimeout(() => {
      setShowProgress(true);
      setProgress(100);
      
      // Animate progress bar emptying over 1 second
      const startTime = Date.now();
      const duration = 1000;
      
      progressIntervalRef.current = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const newProgress = Math.max(0, 100 - (elapsed / duration) * 100);
        setProgress(newProgress);
        
        if (newProgress === 0) {
          if (progressIntervalRef.current) {
            clearInterval(progressIntervalRef.current);
          }
        }
      }, 16); // ~60fps
    }, 1000);

    // Set timeout to send recording after 2 seconds total (1s + 1s)
    recordingTimeoutRef.current = setTimeout(() => {
      if (recordingRef.current.length > 0) {
        setShowProgress(false);
        onUserPlay([...recordingRef.current]);
        recordingRef.current = [];
      }
    }, 2000);

    // Visual feedback
    setTimeout(() => {
      const newKeys = new Set(userPressedKeys);
      newKeys.delete(noteKey);
      setUserPressedKeys(newKeys);
    }, 200);
  };

  return (
    <div className="relative w-full max-w-6xl mx-auto">
      <div className="relative flex h-64 bg-card rounded-lg shadow-2xl p-4 overflow-x-auto">
        {notes.map((note, index) => {
          const noteKey = `${note.note}${note.octave}`;
          const isActive = activeKeys.has(noteKey) || userPressedKeys.has(noteKey);
          const isAiActive = activeKeys.has(noteKey) && aiPlaying;
          
          return (
            <PianoKey
              key={noteKey}
              note={noteKey}
              frequency={note.frequency}
              isBlack={note.isBlack}
              isActive={isActive}
              isAiActive={isAiActive}
              onPress={() => handleKeyPress(noteKey, note.frequency)}
              disabled={aiPlaying}
            />
          );
        })}
      </div>
      
      {aiPlaying && (
        <div className="absolute top-2 right-2 px-4 py-2 bg-secondary/80 backdrop-blur rounded-full text-sm font-medium animate-pulse">
          AI Playing...
        </div>
      )}
      
      {showProgress && !aiPlaying && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <div className="bg-card border border-border shadow-lg rounded-lg p-4 min-w-[300px]">
            <div className="text-sm font-medium text-center text-foreground mb-3">
              AI preparing response...
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-key-active-user to-accent transition-all duration-[16ms] ease-linear"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

Piano.displayName = "Piano";

export default Piano;
