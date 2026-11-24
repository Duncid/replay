import { Capacitor, registerPlugin } from '@capacitor/core';
import { brokeredPreviewStorage } from './previewAuthStorage';

const vault = registerPlugin<{
  getSession(options: { key: string }): Promise<{ value: string | null }>;
  saveSession(options: { key: string; value: string }): Promise<void>;
  removeSession(options: { key: string }): Promise<void>;
}>('ReplayAuth');

// WKWebView storage is separate from Safari. Keep its session in this app's Keychain.
export function authStorage() {
  return Capacitor.isNativePlatform() ? {
    getItem: async (key: string) => (await vault.getSession({ key })).value,
    setItem: async (key: string, value: string) => vault.saveSession({ key, value }),
    removeItem: async (key: string) => vault.removeSession({ key }),
  } : brokeredPreviewStorage();
}
