import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.replay.app',
  appName: 'Replay',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
  },
};

export default config;
