import { useState, useEffect, useCallback, useRef } from "react";

interface MidiDevice {
  id: string;
  name: string;
  manufacturer: string;
}

interface MidiNote {
  note: string;
  octave: number;
  frequency: number;
  velocity: number;
}

interface UseMidiInputReturn {
  devices: MidiDevice[];
  connectedDevice: MidiDevice | null;
  isSupported: boolean;
  error: string | null;
  requestAccess: () => Promise<void>;
  disconnect: () => void;
}

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;

// Convert MIDI note number (0-127) to note name and octave
const midiToNoteName = (midiNote: number): { note: string; octave: number } => {
  const noteNames = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midiNote / 12) - 1;
  const noteIndex = midiNote % 12;
  return { note: noteNames[noteIndex], octave };
};

// Calculate frequency from MIDI note number
const midiToFrequency = (midiNote: number): number => {
  return 440 * Math.pow(2, (midiNote - 69) / 12);
};

export const useMidiInput = (
  onNoteOn?: (noteKey: string, frequency: number, velocity: number) => void,
  onNoteOff?: (noteKey: string, frequency: number) => void,
  onManualConnectNoDevices?: () => void,
  onError?: (errorMessage: string) => void
): UseMidiInputReturn => {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<MidiDevice | null>(null);
  const [error, setError] = useState<string | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const activeInputRef = useRef<MIDIInput | null>(null);
  const hasAutoConnectedRef = useRef(false);

  // Check if Web MIDI is supported
  const isSupported = typeof navigator !== "undefined" && "requestMIDIAccess" in navigator;

  const handleMidiMessage = useCallback(
    (event: MIDIMessageEvent) => {
      const [status, midiNote, velocity] = event.data;
      const command = status & 0xf0;

      if (command === NOTE_ON && velocity > 0) {
        const { note, octave } = midiToNoteName(midiNote);
        const noteKey = `${note}${octave}`;
        const frequency = midiToFrequency(midiNote);
        const normalizedVelocity = velocity / 127;

        console.log(`[MIDI] Note ON: ${noteKey}, velocity: ${velocity}, freq: ${frequency.toFixed(2)}Hz`);
        onNoteOn?.(noteKey, frequency, normalizedVelocity);
      } else if (command === NOTE_OFF || (command === NOTE_ON && velocity === 0)) {
        const { note, octave } = midiToNoteName(midiNote);
        const noteKey = `${note}${octave}`;
        const frequency = midiToFrequency(midiNote);

        console.log(`[MIDI] Note OFF: ${noteKey}`);
        onNoteOff?.(noteKey, frequency);
      }
    },
    [onNoteOn, onNoteOff]
  );

  const disconnect = useCallback(() => {
    if (activeInputRef.current) {
      // Explicitly clear the handler
      activeInputRef.current.onmidimessage = null;
      activeInputRef.current = null;
    }
    setConnectedDevice(null);
    console.log("[MIDI] Disconnected");
  }, []);

  // Clear all MIDI handlers from all inputs to prevent stale handlers
  const clearAllMidiHandlers = useCallback(async () => {
    if (!isSupported) return;
    
    try {
      const access = await navigator.requestMIDIAccess();
      const inputs = Array.from(access.inputs.values());
      inputs.forEach((input) => {
        // Clear any existing handlers
        input.onmidimessage = null;
      });
      console.log(`[MIDI] Cleared handlers from ${inputs.length} input(s)`);
    } catch (err) {
      console.error("[MIDI] Error clearing handlers:", err);
    }
  }, [isSupported]);

  const connectToDevices = useCallback(async (isManual: boolean) => {
    // Ensure we don't accumulate multiple connections (e.g., from Strict Mode double-invocation)
    disconnect();

    if (!isSupported) {
      if (isManual) {
        const errorMessage = "Web MIDI API is not supported in this browser. Try Chrome, Edge, or Opera.";
        setError(errorMessage);
        onError?.(errorMessage);
      }
      return;
    }

    try {
      setError(null);
      console.log("[MIDI] Requesting MIDI access...");

      // Clear all existing handlers before connecting to prevent stale handlers
      await clearAllMidiHandlers();

      const access = await navigator.requestMIDIAccess();
      midiAccessRef.current = access;

      const inputs = Array.from(access.inputs.values());
      const deviceList: MidiDevice[] = inputs.map((input) => ({
        id: input.id,
        name: input.name || "Unknown Device",
        manufacturer: input.manufacturer || "Unknown",
      }));

      setDevices(deviceList);
      console.log(`[MIDI] Found ${deviceList.length} device(s):`, deviceList);

      if (inputs.length === 0) {
        // Only show error/toast for manual connection attempts
        if (isManual) {
          onManualConnectNoDevices?.();
        }
        return;
      }

      // Auto-connect to first device
      const firstInput = inputs[0];
      
      // Clear any existing handler on this input before setting new one
      // This ensures no stale handlers remain from previous sessions
      firstInput.onmidimessage = null;
      
      activeInputRef.current = firstInput;
      firstInput.onmidimessage = handleMidiMessage;

      setConnectedDevice({
        id: firstInput.id,
        name: firstInput.name || "Unknown Device",
        manufacturer: firstInput.manufacturer || "Unknown",
      });

      console.log(`[MIDI] Connected to: ${firstInput.name}`);
    } catch (err) {
      if (isManual) {
        const errorMessage = err instanceof Error ? err.message : "Failed to access MIDI devices";
        setError(errorMessage);
        // Show error in toast notification
        onError?.(errorMessage);
      }
      console.error("[MIDI] Error:", err);
    }
  }, [disconnect, handleMidiMessage, isSupported, onManualConnectNoDevices, onError, clearAllMidiHandlers]);

  const requestAccess = useCallback(async () => {
    await connectToDevices(true);
  }, [connectToDevices]);

  // Auto-connect on mount if supported (silent - no error display)
  useEffect(() => {
    if (isSupported && !hasAutoConnectedRef.current) {
      hasAutoConnectedRef.current = true;
      connectToDevices(false);
    }
  }, [connectToDevices, isSupported]);

  // Update MIDI message handler when callbacks change to avoid stale closures
  useEffect(() => {
    if (activeInputRef.current) {
      // Only update if we have an active connection
      activeInputRef.current.onmidimessage = handleMidiMessage;
      console.log("[MIDI] Updated message handler");
    }
  }, [handleMidiMessage]);

  // Cleanup on unmount - ensure all handlers are cleared
  useEffect(() => {
    return () => {
      disconnect();
      // Clear all handlers on unmount as well
      clearAllMidiHandlers().catch(() => {
        // Ignore errors during cleanup
      });
      if (midiAccessRef.current) {
        midiAccessRef.current = null;
      }
    };
  }, [disconnect, clearAllMidiHandlers]);

  return {
    devices,
    connectedDevice,
    isSupported,
    error,
    requestAccess,
    disconnect,
  };
};
