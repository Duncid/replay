export const STORAGE_KEYS = {
  INSTRUMENT: "piano-app-instrument",
  BPM: "piano-app-bpm",
  TIME_SIGNATURE: "piano-app-time-signature",
  METRONOME_SOUND: "piano-app-metronome-sound",
  METRONOME_VOLUME: "piano-app-metronome-volume",
  AI_MODEL: "piano-app-ai-model",
  ACTIVE_MODE: "piano-app-active-mode",
  COMPOSE_HISTORY: "piano-app-compose-history",
  IMPROV_HISTORY: "piano-app-improv-history",
} as const;

export const ALL_STORAGE_KEYS = Object.values(STORAGE_KEYS);
