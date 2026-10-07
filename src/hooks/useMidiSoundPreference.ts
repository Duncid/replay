import { useLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { MidiDeviceIdentity, midiSoundPreferenceKey, recognizeMidiDevice } from "@/utils/midiDeviceProfiles";

export function useMidiSoundPreference(device: MidiDeviceIdentity | null) {
  const [overrides, setOverrides] = useLocalStorage<Record<string, boolean>>(
    STORAGE_KEYS.MIDI_SOUND_OVERRIDES,
    {},
  );
  const profile = device ? recognizeMidiDevice(device) : null;
  const key = device ? midiSoundPreferenceKey(device) : null;
  const override = key && Object.prototype.hasOwnProperty.call(overrides, key)
    ? overrides[key] : undefined;
  const hasOwnSound = override ?? profile?.hasOwnSound ?? false;
  const setHasOwnSound = (value: boolean) => {
    if (key) setOverrides(previous => ({ ...previous, [key]: value }));
  };
  return { hasOwnSound, setHasOwnSound };
}
