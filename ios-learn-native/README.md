# Replay Learn — native iPad app

A standalone Swift/SwiftUI iPad app for **Tunes**:
published tune library → selected tune → practice → evaluation → feedback.
It is a separate native project — the Capacitor app in `ios/` is
untouched.

- Bundle id: `com.playbk.learn`
- Minimum iPadOS: 18.6
- Distribution: direct install via Xcode (dev)

## What it does

- **Tune library** — all published tunes, with visible locked/unlocked states.
  Completing prerequisite tunes unlocks successors; lesson and skill requirements
  no longer block tune selection. The library refreshes when leaving practice.
- **Tune practice** — the existing pooled SpriteKit highway and keyboard,
  demo playback, previous/next sections, and a plan from `tune-coach`.
- **Evaluation** — MIDI attempts go to `tune-evaluate`; feedback and reasoning
  appear alongside retry/next-section actions. Completed tunes return to the library.
- No teacher greeting or activity recommendation calls occur in this flow.

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
tracked per device via a locally generated `localUserId`, registered in
`local_users` before the first progress write. This identity is separate from
web students; cross-device student selection is not included.

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
- Sheet-music rendering remains out of scope; the highway uses note sequences.
  Published XML and DSP XML are preserved in Cloud, not rendered natively.
- The app needs an internet connection for tunes, practice plans, and evaluation.
- Native highway count-in currently uses 90 BPM / 4/4; it preserves sequence
  timing in seconds rather than changing playback speed.

## Tests and validation

Run the standalone tune progression tests:

```sh
swiftc ReplayLearn/Models.swift Tests/main.swift -o /tmp/replay-tune-tests
/tmp/replay-tune-tests
```

Full SwiftUI/SpriteKit compilation and on-device playback require Xcode on a
Mac. Verify library loading, disabled locked tunes, demo sync, MIDI recording,
evaluation, next section, and completion refreshing the library before install.
