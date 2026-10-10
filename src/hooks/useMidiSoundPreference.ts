import { useEffect, useSyncExternalStore } from "react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { MidiDeviceIdentity, midiSoundPreferenceKey } from "@/utils/midiDeviceProfiles";
import { enableKeyboardPlayback, hasMidiOutput, subscribeMidiOutput } from "@/lib/midiOutput";

export function useMidiSoundPreference(device: MidiDeviceIdentity | null) {
  const [silentSettings, setSilentSettings] = useLocalStorage<Record<string, boolean>>(
    STORAGE_KEYS.MIDI_SOUND_OVERRIDES, {},
  );
  const [outputSettings, setOutputSettings] = useLocalStorage<Record<string, boolean>>(
    "replay-midi-play-on-keyboard", {},
  );
  const canPlayOnKeyboard = useSyncExternalStore(subscribeMidiOutput, hasMidiOutput, () => false);
  const key = device ? midiSoundPreferenceKey(device) : null;
  const silentWhilePlaying = key ? silentSettings[key] ?? false : false;
  const playOnKeyboard = key ? outputSettings[key] ?? false : false;
  useEffect(() => {
    enableKeyboardPlayback(!!key && playOnKeyboard && canPlayOnKeyboard);
    return () => enableKeyboardPlayback(false);
  }, [key, playOnKeyboard, canPlayOnKeyboard]);
  return {
    silentWhilePlaying, playOnKeyboard, canPlayOnKeyboard,
    setSilentWhilePlaying: (value: boolean) => {
      if (key) setSilentSettings(previous => ({ ...previous, [key]: value }));
    },
    setPlayOnKeyboard: (value: boolean) => {
      if (key) setOutputSettings(previous => ({ ...previous, [key]: value }));
    },
  };
}
