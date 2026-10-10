# Native iPad "Learn" app (Swift/SwiftUI, separate project)

## Goal
A standalone native iPad app that reproduces only the **Learn** experience (AI teacher lessons: greeting → lesson → practice → evaluation), built as a separate Swift/SwiftUI Xcode project. The existing Capacitor app stays untouched. Distribution: direct install via Xcode (dev).

## Where it lives
New folder `ios-learn-native/` in this repo (separate Xcode project, its own bundle id, e.g. `com.playbk.learn`). It shares nothing with `ios/` (Capacitor) except the backend.

## Backend reuse (no new backend work)
The app calls the existing Lovable Cloud edge functions over HTTPS with the anon key:
- `teacher-greet` — greeting + suggestions
- `lesson-start` — lesson brief, instruction, demo sequence, metronome setup
- `lesson-evaluate` — attempt evaluation (returns feedback + reasoning)
- `piano-ask` — free-form questions (if in Learn scope)

## App structure (SwiftUI, iPadOS 18.6+, landscape-first)
1. **Welcome screen** — teacher greeting + lesson suggestions (from `teacher-greet`).
2. **Lesson screen** — instruction card, demo playback, metronome controls.
3. **Practice/Evaluation screen** — record attempt via MIDI, submit to `lesson-evaluate`, show feedback + reasoning, retry/advance flow.
4. **Piano keyboard view** — native on-screen keyboard (SwiftUI canvas) for display + touch fallback.

## Native layers
- **MIDI**: CoreMIDI directly (USB COMPUTER port), note-on/off → pitch/timing events. No Web MIDI polyfill needed.
- **Audio**: AVAudioEngine + sampler for piano playback (demo sequences, key presses) — preload samples at launch to avoid first-note latency.
- **Metronome**: AVAudioEngine scheduled clicks, ported from `useToneMetronome` settings (bpm, feel, sound).
- **Networking**: URLSession + Codable models mirroring `src/types/learningSession.ts`.

## Deliverables
- Xcode project skeleton + app target, signing-ready for dev install
- CoreMIDI input manager
- Piano audio engine (preloaded samples)
- API client + Codable models for the 3–4 edge functions
- SwiftUI screens for the Learn flow
- README with build/install steps (`xcodebuild` / Xcode → device)

## Out of scope
- Quest editor, Tune Manager, Lab mode, mic transcription, sheet music rendering (OSMD) — Learn uses sequences, not engraved scores. If sheet display is wanted later, add a simple native staff renderer as a follow-up.

## Steps
1. Scaffold Xcode project in `ios-learn-native/`
2. API client + models, verified against live edge functions
3. CoreMIDI input + piano audio engine
4. Learn flow screens + state machine
5. Metronome
6. README + build verification (user builds on their Mac)
