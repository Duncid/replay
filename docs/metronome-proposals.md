# Metronome Enhancement Proposals

## Current constraints observed in the UI and audio engine
- **Time signatures limited to 2/4, 3/4, 4/4, 6/8** from `beatsPerBar` and menu options, preventing odd and additive meters (e.g., 5/8, 7/8, 3+2+3/8).【F:src/components/Metronome.tsx†L18-L56】【F:src/components/Metronome.tsx†L102-L137】
- **BPM slider clamped to 40–220**, blocking very slow rubato work or hyper-fast drills.【F:src/components/Metronome.tsx†L111-L118】【F:src/components/Metronome.tsx†L167-L175】
- **Single accent on beat one only**, with no per-beat or polyrhythmic accent map support.【F:src/components/Metronome.tsx†L58-L101】
- **Sound palette restricted to four synthesized timbres** with a single downbeat accent per sound type.【F:src/hooks/useToneMetronome.ts†L1-L124】
- **No subdivision, swing, or tuplets**—clicks are scheduled per beat only and there is no swing feel parameter in the scheduler.【F:src/components/Metronome.tsx†L75-L101】
- **No tempo tools** such as tap tempo, count-in bars, or accelerando/ritardando automation; the hook only schedules steady clicks at a fixed BPM.【F:src/components/Metronome.tsx†L64-L101】【F:src/components/Metronome.tsx†L120-L165】

## Proposed feature set and implementation notes
1. **Broader meters and additive grouping**
   - Extend `beatsPerBar` to include 5/4, 5/8, 7/8, 9/8, 12/8, and additive labels (e.g., `3+2+3/8`).【F:src/components/Metronome.tsx†L18-L56】
   - Swap the static radio list for a grouped selector that differentiates simple, compound, and additive meters, and derive beat grouping for accent patterns.
   - Update scheduler to respect grouping arrays (e.g., `[3,2,3]`) for visual and audio accents rather than a single first-beat accent.

2. **Expanded tempo handling with simple controls**
   - Broaden slider range to 20–300 BPM with tooltips for extreme ends, keeping input selection-only (no freeform fields) via preset step buttons (e.g., ±1/±5 BPM) and slider snaps.【F:src/components/Metronome.tsx†L111-L118】【F:src/components/Metronome.tsx†L167-L175】
   - Add tap-tempo (4+ taps averaged) and tempo ramping controls (e.g., +5 BPM after N bars or linear ramp over X seconds) by adjusting `bpmRef` inside the scheduler.

3. **Preset accent maps and polyrhythms (selection-only UI)**
   - Replace the fixed `isAccent = beatNumber === 0` logic with preset accent patterns per meter, selectable from a list rather than freeform editing.【F:src/components/Metronome.tsx†L58-L101】
   - Provide curated presets for clave (son/rhumba), 3:2/2:3, 12/8 bell, samba partido alto, and additive groupings (3+3+2), keeping per-beat toggles optional and limited to simple on/off for clarity.
   - Render visual dots using accent strength (primary/secondary/ghost) and trigger different velocity envelopes in `useToneMetronome` per accent level.

4. **Subdivision grid, swing, and tuplets**
   - Add a subdivision selector (eighths, triplets, sixteenths, custom tuplets) and schedule sub-clicks between beats using the existing lookahead loop.【F:src/components/Metronome.tsx†L64-L101】
   - Introduce swing % (e.g., 54–75%) applied to off-beat subdivision timing, reusing Tone.js time offsets to delay the “and” beats.
   - Allow “subdivision-only” mode that mutes downbeats for rhythmic dictation practice.

5. **Sound palette and routing upgrades (library-only, simple selection)**
   - Expand `MetronomeSoundType` with a small, fixed library-sourced set (e.g., clave, cowbell, rim, triangle, shaker) using Tone.js or existing bundled samples—no user uploads or external URLs.【F:src/hooks/useToneMetronome.ts†L1-L124】
   - Add per-layer routing: downbeat, secondary accent, subdivision, and count-in clicks can map to different sounds and levels; expose quick-mix sliders in the UI alongside the existing volume control while keeping choices as dropdowns/select chips.
   - Drop the sample-loader concept entirely to ensure all sounds are available offline and selectable without custom inputs.

6. **Practice flows and sequencing**
   - Offer count-in bars and programmable bar sequences (e.g., alternating 3/4 → 4/4, or 7/8 grouped 2+2+3) by scheduling a multi-bar pattern list.
   - Add “tempo ladder” practice: after every N bars, auto-increase/decrease BPM until limits are reached, then stop or loop.
   - Persist custom presets (meter, accents, sounds, tempo ramps) with export/import JSON to share grooves.

7. **Accessibility and feedback**
   - Provide haptic/visual-only mode for silent metronome use, and an optional flashing LED synced to downbeats and subdivisions.
   - Add latency calibration test that measures output-to-input delay and offsets scheduled clicks accordingly for tighter alignment.

Each proposal aligns with the current architecture: the `Metronome` component manages UI state, while `useToneMetronome` encapsulates sound generation—extensions can be added by widening state (accent arrays, subdivisions, sounds) and scheduling logic inside the existing lookahead scheduler without rewriting the overall component.
