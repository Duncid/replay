export interface MidiDeviceIdentity {
  name: string;
  manufacturer: string;
}

interface MidiDeviceProfile {
  model: string;
  manufacturer: string;
  aliases: string[];
  hasOwnSound: boolean;
  sourceUrl: string;
}

// Verified manufacturer specifications, bundled for offline use.
// Add exact model aliases rather than assuming an entire brand/series has sound.
export const MIDI_DEVICE_PROFILES: MidiDeviceProfile[] = [
  { model: "FP-10", manufacturer: "Roland", aliases: ["FP-10", "FP10"], hasOwnSound: true,
    sourceUrl: "https://www.roland.com/uk/products/fp-10/specifications/" },
  { model: "FP-30X", manufacturer: "Roland", aliases: ["FP-30X", "FP30X"], hasOwnSound: true,
    sourceUrl: "https://static.roland.com/assets/media/pdf/FP-30X_eng01_W.pdf" },
  { model: "P-145", manufacturer: "Yamaha", aliases: ["P-145", "P145"], hasOwnSound: true,
    sourceUrl: "https://ca.yamaha.com/en/musical-instruments/pianos/products/p-series/p-145/" },
  { model: "B2", manufacturer: "Korg", aliases: ["B2"], hasOwnSound: true,
    sourceUrl: "https://www.korg.com/de/products/digitalpianos/b2/specifications.php" },
  { model: "MPK mini mk3", manufacturer: "Akai", aliases: ["MPK mini mk3", "MPK mini 3", "MPK mini mkIII"], hasOwnSound: false,
    sourceUrl: "https://support.akaipro.com/en/support/solutions/articles/69000798861-akai-pro-mpk-mini-mk3-frequently-asked-questions" },
  { model: "MPK mini Play", manufacturer: "Akai", aliases: ["MPK mini Play"], hasOwnSound: true,
    sourceUrl: "https://support.akaipro.com/en/support/solutions/articles/69000798894-akai-pro-mpk-mini-play-frequently-asked-questions" },
  { model: "MPK mini Play mk3", manufacturer: "Akai", aliases: ["MPK mini Play mk3", "MPK mini Play 3"], hasOwnSound: true,
    sourceUrl: "https://support.akaipro.com/en/support/solutions/articles/69000805679-akai-pro-mpk-mini-play-mk3-onboard-features-standalone-use" },
];

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export function recognizeMidiDevice(device: MidiDeviceIdentity): MidiDeviceProfile | null {
  const name = normalize(device.name);
  const manufacturer = normalize(device.manufacturer);
  const matches = MIDI_DEVICE_PROFILES.filter(profile => {
    const brand = normalize(profile.manufacturer);
    // Some MIDI endpoints expose only a model; short names like B2 require a brand.
    const hasBrand = manufacturer.includes(brand) || name.split(" ").includes(brand);
    return profile.aliases.some(alias => {
      const model = normalize(alias);
      return (model.length > 2 || hasBrand) && (` ${name} `).includes(` ${model} `);
    });
  });
  // Prefer the more specific variant (MPK mini Play mk3 over MPK mini Play).
  return matches.sort((a, b) => b.model.length - a.model.length)[0] ?? null;
}

export function midiSoundPreferenceKey(device: MidiDeviceIdentity): string {
  const profile = recognizeMidiDevice(device);
  // Native/Web MIDI IDs may change on reconnect. Model/name remains stable.
  return profile
    ? `${normalize(profile.manufacturer)}:${normalize(profile.model)}`
    : `${normalize(device.manufacturer)}:${normalize(device.name)}`;
}
