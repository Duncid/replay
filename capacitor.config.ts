import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.playbk.app',
  appName: 'Replay',
  webDir: 'dist',
  ios: {
    // The root layout applies the actual native safe-area CSS variables.
    contentInset: 'never',
  },
};

export default config;
