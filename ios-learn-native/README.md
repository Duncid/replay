# Noodlyn Learn — native iPad app

A standalone Swift/SwiftUI app for **Tunes, Free Play and Progress**, independent
of the Capacitor wrapper in `ios/`. Bundle `com.playbk.learn`, scheme `ReplayLearn`.
Minimum **iPadOS 26.0**, built with Xcode 26 or later.

## Experience

- Search/filter the published library. Cards draw previews from actual published
  note sequences; prerequisites and acquisitions come from Cloud.
- Resume the last practice plan and section saved on this iPad. Resume is a
  section position, not a fabricated completion percentage.
- Practice with a vertical SpriteKit Note Highway, a four-beat visual count-in,
  replay/stop, restart, previous/next, coach hints and touch or MIDI recording.
  Evaluation still uses `tune-evaluate`; plans still use `tune-coach`.
- Free Play supports chords, glissando, an adjustable metronome and 88-key range.
- Progress shows server-confirmed acquired tunes and the latest 200 evaluated
  attempts saved on this device. It does not invent weekly activity or streaks.
- USB MIDI detection starts automatically when the practice profile opens and tracks
  devices being plugged in or removed through CoreMIDI. Bluetooth discovery
  uses Apple's MIDI browser. Bluetooth permission is requested when needed.
- Compose and microphone transcription are not included. There are no placeholder
  instrument selectors or nonfunctional feature tabs.

## Native design system

Open **Settings → Design system**, available even if the backend is offline.
The catalog uses the production tokens, controls, materials, cards, feedback and
playable keyboard. `--design-system` opens it without constructing the lesson
model or accessing Cloud; the keyboard creates its own local audio engine.

Acid uses dark solid content (`060709`, `0F1116`, `181B22`), lime primary
`C6FF1A`, blue AI `25B8FF`, and the seven pitch colors. System Liquid Glass is
reserved for chrome, coach and transport. Reduce Transparency gets solid chrome;
Increase Contrast strengthens outlines. Input highlights never animate.
Space Grotesk and JetBrains Mono TTFs and OFL licenses are bundled natively;
body/control text uses SF Pro and Dynamic Type.

### Keyboard contract

`PianoGeometry` is the single source for rail layout, key drawing and hit tests.
The rail is 52 pt (24 + 2 + 24 + 2); the normal dock is 300 pt. White padding/gaps
are 2 pt; black keys are 58% of white-key width and key height. Black keys draw
above white keys and win overlapping hit tests. Labels live only in the rail;
VoiceOver keys expose pitch names and activation actions.

Normal wide range is C3–C5; narrow is C3–G4. Practice shifts the range by octaves
when needed for the current phrase. The full 88-key option scrolls without
shrinking keys. Lime identifies user input and blue identifies demo notes.
Idle sharp labels use contrast-corrected ink, rather than copying the handoff's
white-on-bright-green/cyan combination.

`PianoSurface` tracks each UIKit touch independently. Shared pitches send one
note-on until the last finger lifts; glissando emits releases/presses on crossing.
Cancellation, layout changes and app suspension release held input. Touch and MIDI
ownership are tracked separately. Demo highlights follow one cancellable polyphonic
event timeline, without detached note-off tasks.

## Architecture and data

Drawing (`NoteHighwayScene`), timing (`HighwayClock`) and scoring (`HitJudge`)
remain separate. Scene lanes/bars/labels are pooled at initialization and notes at
sequence load; update does not create nodes or effects. The UIKit keyboard replaces
both old duplicate keyboard renderers.

Audio uses 16 preallocated AVAudioPlayerNodes and cached synthesized note buffers.
Player connections and PCM buffers must keep the same mono 44.1 kHz format; the
mixer converts to hardware output. This preserves the Play Demo crash fix. The
sound is synthesized, not a sampled acoustic piano. Practice timing remains
90 BPM / 4/4 for count-in and guides; source note timing stays in seconds.

Cloud uses the signed-in account's practice profiles, shared with the web app.
Select a profile or sign out in Settings. Library/plans/evaluation use the account's
access token; refresh tokens are stored in Keychain and rotated automatically.
Resume and recent attempts stay local, separately for each profile. Legacy local
practice is imported only when the server confirms ownership of that device's old
profile. No teacher greeting or recommendation endpoint is called.

## Build and install

Open the Xcode project, select a signing team and connected iPad, then run.

```sh
xcodebuild -project ios-learn-native/ReplayLearn.xcodeproj -scheme ReplayLearn \
  -configuration Debug -destination 'id=<ipad-udid>' \
  -derivedDataPath /tmp/replay-native -allowProvisioningUpdates build
```

## Validation

From the repository root:

```sh
swiftc ios-learn-native/ReplayLearn/Models.swift \
  ios-learn-native/ReplayLearn/Views/PianoGeometry.swift \
  ios-learn-native/ReplayLearn/MIDIByteParser.swift \
  ios-learn-native/ReplayLearn/Highway/HitJudge.swift \
  ios-learn-native/Tests/main.swift -o /tmp/replay-native-tests
/tmp/replay-native-tests
bash ios-learn-native/Tests/audio-smoke.sh <booted-simulator-udid>
bash ios-learn-native/Tests/native-smoke.sh <booted-simulator-udid>
```

The isolated simulator harnesses use production code, make no Cloud writes, and
remove their temporary test apps. They cover repeat playback, polyphonic demo
highlights, cancellation, font registration, tune locks, resume, source overlap,
chord recording, feedback and suspension. Pure checks cover progression, keyboard
geometry, black-first hits, per-finger lifetime, MIDI parsing and scoring.

Debug-only fixture arguments `--preview-library`, `--preview-practice`,
`--preview-freeplay`, `--preview-progress` exercise the actual screens without Cloud.
The native smoke harness also renders wide and narrow layout snapshots. Fixtures never
write live progress. `--design-system` is available in release builds too.

Before release, verify real USB/Bluetooth MIDI and multi-finger input on hardware;
simulator logic checks do not replace those physical checks. Check portrait,
landscape, narrow windows, large accessibility text and reduced transparency.

## Opt-in Note Highway performance baseline

Debug builds accept `--replay-performance`, `--performance-notes=200` (also 1000/5000),
`--performance-seconds=8`, and optional `--performance-full`. This renders the real
practice screen with an isolated local fixture and plays its demo through the normal
readiness gate and audio engine. It reports SpriteKit cadence, scene-update CPU time,
and audio dispatch offsets; no scoring thresholds or audio scheduling rules change.
All hooks and the fixture screen are excluded from Release builds.

Use `scripts/measure-ipad-performance.py --platform native` from the repository root
after installing a Debug build. See [methodology and results](../docs/ipad-performance.md)
and [the shared runner command](../ios/README.md#opt-in-physical-device-performance-probe).
The two apps keep independent implementations; only the external measurement runner
and the documented workload convention cover both.


### Launch artwork and icons

The launch storyboard uses a centered Noodlyn wordmark and the plain white/black piano. The wordmark is rasterized from Space Grotesk at 80 points; individual key images use 9-part slicing so their corners stay intact as Auto Layout adapts the keyboard width. Short windows can reduce the key height to avoid covering the wordmark. This target owns its storyboard and image assets independently.

Both targets use the existing opaque blue piano icon at 1024px; Xcode derives the device icon sizes. Exported icon sizes, portrait/landscape start screens, and a size/source manifest live in `design-assets/ipad-release/`. Run `npx storybook build -o dist/storybook`, serve the build on port 8082, then `node scripts/export-ipad-assets.mjs`. The exporter also refreshes native launch assets, storyboards, and the existing web icon URLs. Start-screen PNGs are review/export assets; the native launch screen does not stretch a full-screen screenshot.


## Account login and publishing

The public website is `https://noodlyn.com`. Sign-in uses Apple's
`ASWebAuthenticationSession` at the retained Lovable auth origin,
`https://improv-jam-bot.lovable.app`. The site supports Google, Lovable,
and email. After the user confirms their account, the app receives
`com.playbk.learn://auth/callback` with a per-attempt state and validates the session
with Cloud. Tokens are kept in this app's Keychain, independent of the Capacitor app.
Expired refresh credentials return to sign-in; temporary network errors retain the
session and offer retry. The app never registers a new anonymous device identity.

Set the published origin in `ReplayLearn/Info.plist` under `ReplayWebURL` if the
site moves. The `/auth/native` page must be published before this login can work.
See [the shared publishing and allowlist checklist](../ios/README.md#account-login).
Design-system and Debug preview/performance launches remain available without login.

Authentication regression checks use mocked HTTP and in-memory credentials, with
no Cloud writes or real Keychain access:

```sh
swiftc -parse-as-library -swift-version 5 \
  ios-learn-native/ReplayLearn/{Config,Models,APIClient,AuthSession}.swift \
  ios-learn-native/Tests/AuthTests.swift -o /tmp/replay-auth-tests
/tmp/replay-auth-tests
```
