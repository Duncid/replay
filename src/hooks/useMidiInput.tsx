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
  onNoteOff?: (noteKey: string, frequency: number) => void
): UseMidiInputReturn => {
  const [devices, setDevices] = useState<MidiDevice[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<MidiDevice | null>(null);
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
        // Note On
        const { note, octave } = midiToNoteName(midiNote);
        const noteKey = `${note}${octave}`;
        const frequency = midiToFrequency(midiNote);
        const normalizedVelocity = velocity / 127;

        console.log(`[MIDI] Note ON: ${noteKey}, velocity: ${velocity}, freq: ${frequency.toFixed(2)}Hz`);
        onNoteOn?.(noteKey, frequency, normalizedVelocity);
      } else if (command === NOTE_OFF || (command === NOTE_ON && velocity === 0)) {
        // Note Off
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
      activeInputRef.current.onmidimessage = null;
      activeInputRef.current = null;
    }
    setConnectedDevice(null);
    console.log("[MIDI] Disconnected");
  }, []);

  const requestAccess = useCallback(async () => {
    if (!isSupported) {
      setError("Web MIDI API is not supported in this browser. Try Chrome, Edge, or Opera.");
      return;
    }

    try {
      setError(null);
      console.log("[MIDI] Requesting MIDI access...");

      const access = await navigator.requestMIDIAccess();
      midiAccessRef.current = access;

      // Get all available input devices
      const inputs = Array.from(access.inputs.values());
      const deviceList: MidiDevice[] = inputs.map((input) => ({
        id: input.id,
        name: input.name || "Unknown Device",
        manufacturer: input.manufacturer || "Unknown",
      }));

      setDevices(deviceList);
      console.log(`[MIDI] Found ${deviceList.length} device(s):`, deviceList);

      if (inputs.length === 0) {
        setError("No MIDI devices found. Please connect a MIDI device and try again.");
        return;
      }

      // Auto-connect to first device
      const firstInput = inputs[0];
      activeInputRef.current = firstInput;
      firstInput.onmidimessage = handleMidiMessage;

      setConnectedDevice({
        id: firstInput.id,
        name: firstInput.name || "Unknown Device",
        manufacturer: firstInput.manufacturer || "Unknown",
      });

      console.log(`[MIDI] Connected to: ${firstInput.name}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to access MIDI devices";
      setError(errorMessage);
      console.error("[MIDI] Error:", err);
    }
  }, [isSupported, handleMidiMessage]);

  // Auto-connect on mount if supported
  useEffect(() => {
    if (isSupported) {
      requestAccess();
    }
  }, []); // Only run once on mount

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      if (midiAccessRef.current) {
        midiAccessRef.current = null;
      }
    };
  }, [disconnect]);

  return {
    devices,
    connectedDevice,
    isSupported,
    error,
    requestAccess,
    disconnect,
  };
};
