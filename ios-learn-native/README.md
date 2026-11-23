# Replay Nat — native iPad app

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
- MIDI opens on demand. USB sources connect through CoreMIDI; Bluetooth discovery
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

Cloud uses a stable device-local user identity, separate from the web student's
identity. Library/plans/evaluation need a connection. Resume and recent results
are stored locally; they are not cross-device synchronization. No teacher greeting
or recommendation endpoint is called.

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
