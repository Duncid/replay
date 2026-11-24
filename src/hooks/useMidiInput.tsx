import { useState, useEffect, useCallback, useRef } from "react";

import { selectMidiOutput, setMidiOutput } from "@/lib/midiOutput";
import { hasNativeMidiBridge } from "@/lib/webMidiIosPolyfill";

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
  const connectionAttempt = useRef(0);
  const autoAttempted = useRef(false);
  const manualAttempt = useRef(false);
  const heldNotes = useRef(new Map<string, number>());
  const noteOffCallback = useRef(onNoteOff);
  useEffect(() => { noteOffCallback.current = onNoteOff; }, [onNoteOff]);
  const releaseHeldNotes = useCallback(() => {
    for (const [key, frequency] of heldNotes.current) noteOffCallback.current?.(key, frequency);
    heldNotes.current.clear();
  }, []);

  // Check if Web MIDI is supported
  const [isSupported, setIsSupported] = useState(() => typeof navigator !== "undefined" && "requestMIDIAccess" in navigator);

  useEffect(() => {
    const onBridgeReady = () => setIsSupported("requestMIDIAccess" in navigator);
    window.addEventListener("midi-bridge-ready", onBridgeReady);
    onBridgeReady();
    return () => window.removeEventListener("midi-bridge-ready", onBridgeReady);
  }, []);

  const handleMidiMessage = useCallback(
    (event: MIDIMessageEvent) => {
      const [status, midiNote, velocity] = event.data;
      const command = status & 0xf0;

      if (command === NOTE_ON && velocity > 0) {
        const { note, octave } = midiToNoteName(midiNote);
        const noteKey = `${note}${octave}`;
        const frequency = midiToFrequency(midiNote);
        const normalizedVelocity = velocity / 127;
        heldNotes.current.set(noteKey, frequency);

        console.log(`[MIDI] Note ON: ${noteKey}, velocity: ${velocity}, freq: ${frequency.toFixed(2)}Hz`);
        onNoteOn?.(noteKey, frequency, normalizedVelocity);
      } else if (command === NOTE_OFF || (command === NOTE_ON && velocity === 0)) {
        const { note, octave } = midiToNoteName(midiNote);
        const noteKey = `${note}${octave}`;
        const frequency = midiToFrequency(midiNote);

        console.log(`[MIDI] Note OFF: ${noteKey}`);
        heldNotes.current.delete(noteKey);
        onNoteOff?.(noteKey, frequency);
      }
    },
    [onNoteOn, onNoteOff]
  );

  const disconnect = useCallback(() => {
    connectionAttempt.current++;
    manualAttempt.current = false;
    if (midiAccessRef.current) midiAccessRef.current.onstatechange = null;
    midiAccessRef.current = null;
    releaseHeldNotes();
    setMidiOutput(null);
    if (activeInputRef.current) {
      // Explicitly clear the handler
      activeInputRef.current.onmidimessage = null;
      void activeInputRef.current.close().catch((error) => {
        console.error("[MIDI] Failed to close input:", error);
      });
      activeInputRef.current = null;
    }
    setConnectedDevice(null);
    setDevices([]);
    setAttemptedNoDevice(false);
    console.log("[MIDI] Disconnected");
  }, [releaseHeldNotes]);

  const connectToDevices = useCallback(async (isManual: boolean) => {
    setAttemptedNoDevice(false);
    // Ensure we don't accumulate multiple connections (e.g., from Strict Mode double-invocation)
    disconnect();
    const attempt = connectionAttempt.current;
    manualAttempt.current = isManual;

    if (!isSupported) {
      console.log("[MIDI] isSupported=false, requestMIDIAccess in navigator:", "requestMIDIAccess" in navigator);
      if (isManual) {
        const errorMessage = "Web MIDI API is not supported in this browser. On iPad, use the native wrapper build with the CoreMIDI bridge enabled.";
        setError(errorMessage);
        onError?.(errorMessage);
      }
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      setError(null);
      console.log("[MIDI] [DEBUG] About to call navigator.requestMIDIAccess()...");

      const REQUEST_TIMEOUT_MS = 10000;
      const access = await Promise.race([
        navigator.requestMIDIAccess(),
        new Promise<never>((_, reject) =>
          timeoutId = setTimeout(
            () => reject(new Error(`requestMIDIAccess timed out after ${REQUEST_TIMEOUT_MS}ms`)),
            REQUEST_TIMEOUT_MS
          )
        ),
      ]);
      if (attempt !== connectionAttempt.current) return;
      midiAccessRef.current = access;
      access.onstatechange = () => {
        setMidiOutput(activeInputRef.current ? selectMidiOutput(access, activeInputRef.current) : null);
      };
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
          setAttemptedNoDevice(true);
          manualAttempt.current = false;
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
      setMidiOutput(selectMidiOutput(access, firstInput));
      firstInput.onmidimessage = handleMidiMessage;
      console.log("[MIDI] [DEBUG] onmidimessage SET - this triggers polyfill startNativeIfNeeded");

      setConnectedDevice({
        id: firstInput.id,
        name: firstInput.name || "Unknown Device",
        manufacturer: firstInput.manufacturer || "Unknown",
      });

      console.log(`[MIDI] Connected to: ${firstInput.name}`);
    } catch (err) {
      if (attempt !== connectionAttempt.current) return;
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
    } finally {
      clearTimeout(timeoutId);
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
      if (midiAccessRef.current) setMidiOutput(selectMidiOutput(midiAccessRef.current, activeInputRef.current));
      if (name === "No devices") {
        releaseHeldNotes();
        setMidiOutput(null);
        setConnectedDevice(null);
        setDevices([]);
        setAttemptedNoDevice(manualAttempt.current);
        if (manualAttempt.current) onManualConnectNoDevices?.();
        manualAttempt.current = false;
        return;
      }
      const device = {
        id: activeInputRef.current.id,
        name: name || "MIDI input",
        manufacturer: activeInputRef.current.manufacturer || "CoreMIDI",
      };
      setConnectedDevice(device);
      setDevices([device]);
      setAttemptedNoDevice(false);
      manualAttempt.current = false;
    };
    window.addEventListener("midi-sources-updated", onSourcesUpdated);
    const onConnectionError = (event: Event) => {
      const message = (event as CustomEvent<{ message: string }>).detail.message;
      setError(message);
      onError?.(message);
    };
    window.addEventListener("midi-connection-error", onConnectionError);
    return () => {
      window.removeEventListener("midi-sources-updated", onSourcesUpdated);
      window.removeEventListener("midi-connection-error", onConnectionError);
    };
  }, [onManualConnectNoDevices, onError, releaseHeldNotes]);

  // CoreMIDI needs no Connect gesture. Browser MIDI retains its permission flow.
  useEffect(() => {
    if (!isSupported || !hasNativeMidiBridge() || autoAttempted.current) return;
    autoAttempted.current = true;
    void connectToDevices(false);
  }, [connectToDevices, isSupported]);

  // Never request access during cleanup: that can restart native discovery.
  useEffect(() => {
    return () => {
      disconnect();
      autoAttempted.current = false;
    };
  }, [disconnect]);

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
