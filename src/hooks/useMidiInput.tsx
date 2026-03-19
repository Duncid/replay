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
  attemptedNoDevice: boolean;
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
  const [attemptedNoDevice, setAttemptedNoDevice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const midiAccessRef = useRef<MIDIAccess | null>(null);
  const activeInputRef = useRef<MIDIInput | null>(null);

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
    setAttemptedNoDevice(false);
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
    setAttemptedNoDevice(false);
    // Ensure we don't accumulate multiple connections (e.g., from Strict Mode double-invocation)
    disconnect();

    if (!isSupported) {
      console.log("[MIDI] isSupported=false, requestMIDIAccess in navigator:", "requestMIDIAccess" in navigator);
      if (isManual) {
        const errorMessage = "Web MIDI API is not supported in this browser. On iPad, use the native wrapper build with the CoreMIDI bridge enabled.";
        setError(errorMessage);
        onError?.(errorMessage);
      }
      return;
    }

    try {
      setError(null);
      console.log("[MIDI] [DEBUG] About to call navigator.requestMIDIAccess()...");

      const REQUEST_TIMEOUT_MS = 10000;
      const access = await Promise.race([
        navigator.requestMIDIAccess(),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`requestMIDIAccess timed out after ${REQUEST_TIMEOUT_MS}ms`)),
            REQUEST_TIMEOUT_MS
          )
        ),
      ]);
      midiAccessRef.current = access;
      console.log("[MIDI] [DEBUG] requestMIDIAccess() returned successfully");

      const inputs = Array.from(access.inputs.values());
      console.log("[MIDI] [DEBUG] inputs.length:", inputs.length, "input ids:", inputs.map((i) => i.id));
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
      console.log("[MIDI] [DEBUG] Setting onmidimessage on first input:", firstInput.id, firstInput.name);

      // Clear any existing handler on this input before setting new one
      // This ensures no stale handlers remain from previous sessions
      firstInput.onmidimessage = null;

      activeInputRef.current = firstInput;
      firstInput.onmidimessage = handleMidiMessage;
      console.log("[MIDI] [DEBUG] onmidimessage SET - this triggers polyfill startNativeIfNeeded");

      setConnectedDevice({
        id: firstInput.id,
        name: firstInput.name || "Unknown Device",
        manufacturer: firstInput.manufacturer || "Unknown",
      });

      console.log(`[MIDI] Connected to: ${firstInput.name}`);
    } catch (err) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message?: unknown }).message)
            : "Failed to access MIDI devices";
      if (isManual) {
        setError(errorMessage);
        onError?.(errorMessage);
      }
      console.error("[MIDI] Error:", errorMessage, err);
    }
  }, [disconnect, handleMidiMessage, isSupported, onManualConnectNoDevices, onError]);

  const requestAccess = useCallback(async () => {
    console.log("[MIDI] [DEBUG] requestAccess() called (user clicked Connect)");
    await connectToDevices(true);
    console.log("[MIDI] [DEBUG] requestAccess() completed");
  }, [connectToDevices]);

  // Update MIDI message handler when callbacks change to avoid stale closures
  useEffect(() => {
    if (activeInputRef.current) {
      // Only update if we have an active connection
      activeInputRef.current.onmidimessage = handleMidiMessage;
      console.log("[MIDI] Updated message handler");
    }
  }, [handleMidiMessage]);

  // Listen for polyfill name updates (iOS Capacitor: native sources arrive async)
  useEffect(() => {
    const onSourcesUpdated = () => {
      if (!activeInputRef.current) return;
      const name = activeInputRef.current.name;
      if (name === "No devices") {
        activeInputRef.current.onmidimessage = null;
        activeInputRef.current = null;
        setConnectedDevice(null);
        setDevices([]);
        setAttemptedNoDevice(true);
        onManualConnectNoDevices?.();
        return;
      }
      setConnectedDevice((prev) =>
        prev ? { ...prev, name: name || prev.name } : null
      );
      setDevices((prev) =>
        prev.length > 0 && activeInputRef.current
          ? prev.map((d, i) =>
              i === 0 ? { ...d, name: activeInputRef.current!.name || d.name } : d
            )
          : prev
      );
    };
    window.addEventListener("midi-sources-updated", onSourcesUpdated);
    return () => window.removeEventListener("midi-sources-updated", onSourcesUpdated);
  }, [onManualConnectNoDevices]);

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
    attemptedNoDevice,
    isSupported,
    error,
    requestAccess,
    disconnect,
  };
};
