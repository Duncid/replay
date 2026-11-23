# Replay design systems

Replay has two independent implementations: React/Radix/Tailwind for the web and Capacitor app, and SwiftUI for Replay Nat. They share product concepts, not implementation code. SpriteKit drawing, HighwayClock timing and HitJudge scoring remain separate.

## Web component library

Run `npm ci`, then `npm run storybook`. Open http://localhost:6006. Use `npm run storybook:build` for a static catalog in `storybook-static/`, followed by `npm run storybook:test` for Chromium and iPad WebKit interaction checks at `http://localhost:6007/storybook/`. CI builds and tests the catalog.

The sidebar covers foundations, button variants, text fields, settings, navigation, dialogs/sheets/popovers, feedback and tune-card states. Stories import production components; they do not create alternative controls or call Cloud. Controls, generated documentation and the accessibility panel are available in Storybook.

**Instruments → Piano keyboard** documents the central practice surface: playable
C3–C6 keyboard, external chord/sharp highlights, French solfège, player/playback overlap,
disabled input, and the full 88-key scrolling layout. **Instruments → Piano key**
isolates natural/sharp, attack/sustain and instrument-range-disabled states.
The keyboard docs explain anatomy, sizing, pitch colors, source highlights, timing, input
shortcuts and current accessibility limits. Examples use the production components
and local Patch oscillator, with sound only on interaction and no sample downloads.

- Canonical colors: `src/design-system/palettes.json`. Run `npm run tokens:generate` after editing it; typecheck rejects stale generated CSS. `tokens.css` adds fonts, safe areas, shadows, radii and motion; the app and Storybook import the same styles.
- Musical pitch colors: `src/constants/noteColors.ts` reads the same palette JSON for notation and falling notes. Keep labels alongside color.
- Reusable primitives: `src/components/ui/`. Radix owns focus, keyboard and touch behavior.
- Tune card: `src/components/TuneCard.tsx`, used by the live tune library and stories.
- Notifications: Sonner only, mounted once in `App.tsx`. Existing `useToast()` consumers use a small compatibility adapter; it has no separate state or renderer. Use `toast.success/error/info` for new code. `TopToast` is the persistent playback/recording status display, not a second notification system.

The web baseline is **Acid**: near-black surfaces, lime player activity and electric-blue playback. Amber and Hot Wire are comparison palettes in Storybook, not an app theme picker. Space Grotesk, Inter and JetBrains Mono are bundled locally with their OFL licenses for offline use. Use 4 px spacing increments, readable text, visible keyboard focus, and at least 44 px targets for primary touch actions. Compact desktop controls are available where appropriate. The disabled and locked states must include text, not just a color change. Do not introduce a second styling, modal, form or notification framework for a single screen.

### Piano and note rail

The 320 px keyboard panel sits below its measured toolbar and includes a 50 px note rail (two 24 px rows with a 2 px gap). The keys use the remaining height. `createPianoLayout` supplies identical tracks, gaps and black-key columns to keys and rail. Both scroll in one container; the full keyboard keeps its original 1040 px minimum width. Black keys remain 56% of key height and always stack above white keys.

Pitch colors live in the rail, with sharps using the natural below. Keys have no visual labels; their full localized names and octaves remain accessible. Full-keyboard rail labels omit octaves and use compact sharp labels to preserve the original geometry. Idle cell label colors are chosen per palette for at least 4.5:1 contrast. The rail is decorative (`aria-hidden`).

Local input (mouse/touch/computer keyboard/MIDI/microphone) takes visual priority over external playback for a shared note. Keys and rail use the same resolved state; releasing local input restores any remaining playback highlight. Source colors replace the former red/blue attack/sustain animation. Transitions take 70 ms and turn off with reduced motion. Audio scheduling and MIDI routing remain in their existing layers.

`Patterns/Tunes screen` is a production-component fixture with local data; its MIDI and microphone controls are visual examples only. Native Replay Nat retains its independent design system below.

Unused shadcn wrappers and their exclusive packages were removed. Add a primitive back only for a real feature, with a story covering its interaction and disabled/error states. npm and `package-lock.json` are the canonical package workflow; the obsolete Bun binary lockfile was retired.

## Native component library

On iPad, open **Replay Nat → Settings → Design system**. The bundled gallery works offline and remains available if Cloud cannot load. Its keyboard is playable with local audio; catalog examples do not write progress or call Cloud.

- `ReplayLearn/DesignSystem/ReplayDesignSystem.swift`: native Acid colors, pitch palette, typography, spacing, radii, solid cards, action styles and accessible glass chrome.
- `ReplayLearn/DesignSystem/DesignSystemView.swift`: living catalog of foundations, materials, controls, feedback and the production multitouch keyboard.
- `ReplayLearn/Views/PianoGeometry.swift`: shared rail/key geometry and black-first hit tests; `PianoKeyboardView.swift` owns UIKit touch input and VoiceOver keys.
- SpriteKit draws the vertical Note Highway; timing and scoring stay separate. The old duplicate SpriteKit/SwiftUI keyboard renderers are replaced by one instrument surface.

Native uses iPadOS 26+ Liquid Glass for system chrome, coach and transport, with solid dark content and lime primary actions. Body text follows Dynamic Type; bundled Space Grotesk titles and JetBrains Mono metadata remain native assets. Reduce Transparency and Increase Contrast have explicit treatments. The rail is fixed at 11 pt to maintain key alignment; all playable keys have VoiceOver labels.

Launch with `--design-system` to bypass the lesson model and Cloud. The app display name is Replay Nat; scheme ReplayLearn and bundle identifier com.playbk.learn are unchanged. See [the native guide](../ios-learn-native/README.md) for keyboard geometry, scope, data ownership and regression commands.

## Adding or changing a component

1. Update the existing primitive or semantic token instead of adding a near-duplicate.
2. Use that component in the production screen and its catalog examples.
3. Cover long labels, disabled/locked states, error feedback and keyboard/touch access.
4. Run web typecheck/lint/build, Storybook build/tests, and the relevant native build. Validate native layout at large accessibility text sizes and on an iPad before installing.

## Note Highway

Practice uses a vertical **Note Highway** above the piano toolbar, two-row note rail
and keys. Playback and coaching stay above the stage; instrument controls sit
immediately above the rail. The toolbar keeps a neutral border; the separate lime
hit line immediately above it represents musical time.

`pianoLayout.ts` computes the horizontal geometry used by the Pixi stage, rail,
and keys. Normal range is C3–C6; 88-key mode uses a shared scroll position and
1040 px minimum content width. Range dimming never disables keys. Instrument
availability continues to determine whether an instrument can play a pitch.

The renderer takes beat-based `HighwayNote` values (stable ID, MIDI pitch, start,
duration, user/AI ownership, optional judgment and judgment-event beat) plus a
transport supplying current beat, state and reset identity. Rendering does not
judge input. Web practice retains its existing chord gates; no timing grades are
invented for this mode. Untouched notes do not light keys. Audio playback and
visual time use the piano's shared AudioContext and stop advancing on suspension.

Solid pitch = player, outlined translucent pitch = bot, foreground ring + beam =
next chord, inner rail ring = armed, lime/blue key = player/bot. Misses use neutral
grey. Feedback has a text label; reduced motion removes sparks and moving tags.
The stage is decorative, with throttled next-chord announcements and accessible
piano buttons.

Storybook **Instruments / Note Highway** contains Playing, Paused, Waiting for
Chord, Perfect and Bot (4.12), Miss and Next (8.2), Compact and Full Keyboard.
The native design-system catalog includes the two frozen reference states using
its production SpriteKit scene. Native uses `PianoGeometry` independently;
`HighwayClock`, scoring and pooled rendering remain separate. Existing native
80/180 ms scoring windows are unchanged; signed good-hit offsets supply EARLY
or LATE labels. The old horizontal renderer remains in administrative previews.

### Piano dock and Note Highway overlap

Practice stacks highway → lime hit line → piano toolbar → note rail → keys. Playback and coaching stay above the highway. The toolbar stays fixed while highway, rail and keyboard share horizontal pitch alignment and scrolling.

`PianoDock` measures the toolbar and rail with ResizeObserver and supplies `bottomOcclusion` through the highway context. The Pixi surface continues beneath that area, but its musical origin and approach scale use only the exposed highway height. Waiting chords, scoring and audio clocks are unchanged. One backdrop covers both bars: `--piano-dock-blur: 16px`, `--piano-dock-tint: 70%`, fading to opaque at the keyboard edge. Nested rail surfaces are transparent; labels, controls and keys remain sharp. Reduced transparency and unsupported backdrop filters use a solid surface.

Replay Nat independently implements this contract with `HighwayKeyboardSurface`, a dark system blur material and `NoteHighwayScene.bottomOcclusion`. The existing pooled scene shifts its drawing origin without changing `HighwayClock` or `HitJudge`. The UIKit keyboard retains all touch ownership and uses a transparent rail above opaque keys. Both catalogs show the covered continuation at beats 4.12 and 8.2.

The dock leaves 8 px of shared blurred space between toolbar and rail. Connecting MIDI halves the key bed height (white and black keys), leaving toolbar and rail at their normal sizes; disconnecting restores the full height. Freed space goes to the highway. The web Midi Connected story and native catalog toggle document this layout.

Tune demos wait for the production highway's first rendered frame and audio readiness, then give the player one second to prepare. A view-scoped readiness lease prevents stale scene callbacks from starting another lesson. Pending web visuals hold at the first note on the shared demo clock. Replay Nat waits for SpriteKit presentation, then uses a one-second audio-clock lead-in; recording keeps its four-beat count-in. Stop, restart and lesson changes cancel pending starts.
