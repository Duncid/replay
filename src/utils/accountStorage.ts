import { STORAGE_KEYS } from './storageKeys';

let accountId: string | null = null;
const privateKeys = new Set<string>([
  STORAGE_KEYS.PLAY_HISTORY, STORAGE_KEYS.COMPOSE_HISTORY, STORAGE_KEYS.IMPROV_HISTORY,
  STORAGE_KEYS.LESSON_SEQUENCE_HISTORY, STORAGE_KEYS.CURRENT_USER_ID,
  STORAGE_KEYS.ACTIVE_MODE, STORAGE_KEYS.DEBUG_MODE, 'quest-editor-data',
]);

export function setStorageAccount(id: string | null) { accountId = id; }
export function accountStorageKey(key: string) {
  return privateKeys.has(key) ? `${key}:account:${accountId ?? 'signed-out'}` : key;
}
