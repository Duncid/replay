# Replay Learn — native iPad app

A standalone Swift/SwiftUI iPad app that reproduces only the **Learn** experience
of the main Replay app: AI teacher greeting → lesson → practice → evaluation →
feedback. It is a separate native project — the Capacitor app in `ios/` is
untouched.

- Bundle id: `com.playbk.learn`
- Minimum iPadOS: 18.6
- Distribution: direct install via Xcode (dev)

## What it does

- **Welcome screen** — teacher greeting and lesson suggestions (`teacher-greet`).
- **Lesson screen** — instruction, demo playback, metronome (`lesson-start`).
- **Practice / evaluation** — record an attempt on a USB MIDI piano, submit it,
  and show the coach's feedback and reasoning (`lesson-evaluate`), including the
  retry / easier / harder / exit flow.
- **On-screen keyboard** — two-octave fallback when no MIDI piano is connected.

## Native layers

- **MIDI**: CoreMIDI directly — connect the piano's USB COMPUTER port; all
  sources are aggregated. No Web MIDI polyfill needed.
- **Audio**: `AVAudioEngine` with a pool of pre-started voices. All note buffers
  are rendered at app launch (`PianoAudioEngine.preload()`), so the first key
  press plays instantly. The tone is synthesized (sine + harmonics with decay);
  swap `makeBuffer(pitch:)` for sampled buffers to upgrade the sound.
- **Metronome**: scheduled click buffers via `AVAudioPlayerNode`.

## Backend

The app calls the same Lovable Cloud edge functions as the web app, over HTTPS
with the publishable anon key (see `ReplayLearn/Config.swift`). Progress is
tracked per device via a locally generated `localUserId`.

## Build and install

Requires a Mac with Xcode 16+ and an iPad on iPadOS 18.6+.

1. `git pull` this repository.
2. Open `ios-learn-native/ReplayLearn.xcodeproj` in Xcode.
3. Select the `ReplayLearn` scheme, your signing team (Signing & Capabilities),
   and your iPad as the run destination.
4. Build and run (⌘R). On first install, trust the developer certificate on the
   iPad under Settings → General → VPN & Device Management.

Command-line build:

```sh
xcodebuild -project ios-learn-native/ReplayLearn.xcodeproj -scheme ReplayLearn \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/replay-learn-build -allowProvisioningUpdates build
```

## Notes / follow-ups

- Feel presets (swing, shuffle, triplets) currently fall back to straight beats
  in the native metronome.
- Sheet-music rendering is out of scope; Learn uses note sequences only.
- The app needs an internet connection — lessons and evaluations are generated
  by the backend.
