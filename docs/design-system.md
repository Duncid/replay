# Replay design systems

Replay has two independent implementations: React/Radix/Tailwind for the web and Capacitor app, and SwiftUI for Replay Nat. They share product concepts, not implementation code. SpriteKit drawing, HighwayClock timing and HitJudge scoring remain separate.

## Web component library

Run `npm ci`, then `npm run storybook`. Open http://localhost:6006. Use `npm run storybook:build` for a static catalog in `storybook-static/`, followed by `npm run storybook:test` for Chromium and iPad WebKit interaction checks. CI builds and tests the catalog.

The sidebar covers foundations, button variants, text fields, settings, navigation, dialogs/sheets/popovers, feedback and tune-card states. Stories import production components; they do not create alternative controls or call Cloud. Controls, generated documentation and the accessibility panel are available in Storybook.

**Instruments → Piano keyboard** documents the central practice surface: playable
C3–C6 keyboard, external chord/sharp highlights, French solfège, plain labels,
disabled input, and the full 88-key scrolling layout. **Instruments → Piano key**
isolates natural/sharp, attack/sustain and instrument-range-disabled states.
The keyboard docs explain anatomy, sizing, pitch colors/stripes, timing, input
shortcuts and current accessibility limits. Examples use the production components
and local Patch oscillator, with sound only on interaction and no sample downloads.

- Semantic colors, keyboard colors, base radius and motion tokens: `src/design-system/tokens.css`, imported by `src/index.css` in both the app and Storybook.
- Musical pitch colors: `src/constants/noteColors.ts`. Keep labels alongside color.
- Reusable primitives: `src/components/ui/`. Radix owns focus, keyboard and touch behavior.
- Tune card: `src/components/TuneCard.tsx`, used by the live tune library and stories.
- Notifications: Sonner only, mounted once in `App.tsx`. Existing `useToast()` consumers use a small compatibility adapter; it has no separate state or renderer. Use `toast.success/error/info` for new code. `TopToast` is the persistent playback/recording status display, not a second notification system.

The visual baseline is the existing dark surface / warm gold theme. Use 4 px spacing increments, readable text, visible keyboard focus, and at least 44 px targets for primary touch actions. Compact desktop controls are available where appropriate. The disabled and locked states must include text, not just a color change. Do not introduce a second styling, modal, form or notification framework for a single screen.

Unused shadcn wrappers and their exclusive packages were removed. Add a primitive back only for a real feature, with a story covering its interaction and disabled/error states. npm and `package-lock.json` are the canonical package workflow; the obsolete Bun binary lockfile was retired.

## Native component library

On the iPad, open **Replay Nat → Design system**. The button remains available when the backend is unavailable. The gallery is bundled in the app and works offline. Its sample controls do not start audio, write progress or call Cloud.

- `ReplayLearn/DesignSystem/ReplayDesignSystem.swift`: semantic colors, spacing, radii, 44 pt control height, button style, card, tune card, status and feedback components.
- `ReplayLearn/DesignSystem/DesignSystemView.swift`: interactive catalog with dark/light preview, Dynamic Type typography, buttons, fields, switches, sliders, tune states, feedback and connection/loading examples.
- The actual library and practice screens consume these components, so the catalog stays representative.

Native surfaces use adaptive system colors and system text styles; the accent is warm gold. Support Dynamic Type and VoiceOver. Use a label or symbol alongside state colors. Native components remain SwiftUI rather than reusing web code. Highway rendering is unchanged.

For isolated preview, use `#Preview { DesignSystemView() }` in Xcode or launch the app with `--design-system`; this bypasses the lesson model, network and audio setup. The app display name is Replay Nat; its scheme remains ReplayLearn and bundle identifier remains com.playbk.learn.

## Adding or changing a component

1. Update the existing primitive or semantic token instead of adding a near-duplicate.
2. Use that component in the production screen and its catalog examples.
3. Cover long labels, disabled/locked states, error feedback and keyboard/touch access.
4. Run web typecheck/lint/build, Storybook build/tests, and the relevant native build. Validate native layout at large accessibility text sizes and on an iPad before installing.
