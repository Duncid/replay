# Replay modernization review — 6 October 2026

Scope: current local `multipleHandsMusic` checkout, including existing uncommitted changes. This review does not change application code or install updated packages. Older compatibility may be dropped, per the user's instruction.

The sections below record the initial review. The implementation results are recorded at the end.

## Baseline and verification

- Remote refs refreshed. Both remote-only commits have patch-equivalent changes locally (`git cherry`); preserve local commits and pending edits when reconciling branch history.
- Production web build passes in 7.64 seconds. Main JavaScript chunk: 9,045 kB uncompressed / 1,340 kB gzip.
- Application TypeScript check passes (`tsc --noEmit -p tsconfig.app.json`). Strict checking is currently disabled.
- Lint fails: 27 errors and 18 warnings. It also scans the Python virtual environment.
- Playwright cannot load: its config imports the undeclared, missing `lovable-agent-playwright-config` package. No `e2e` directory exists.
- Fresh iOS build with saved settings fails: Pods target iOS 13, below the installed SDK's supported minimum of iOS 15. App targets independently specify iOS 18.6.
- npm audit reports 56 affected dependency entries: 3 critical, 41 high, 12 moderate. These include transitive/build dependencies; counts do not establish 56 exploitable app vulnerabilities. No exploitability assessment was performed.

## First priorities

1. **Fix microphone worklet packaging on web and iPad.** `src/audio/mic/MicCapture.ts:11` imports the TypeScript worklet with `?url`. The production bundle embeds the original TypeScript, including `import type`, `declare`, and private typed fields. Extracting the emitted asset and running `node --check` reproduces a syntax error. Emit compiled JavaScript for `audioWorklet.addModule`, then test real capture and PCM delivery in browser/WebKit.
2. **Complete native microphone setup.** `ios/App/App/Info.plist` has no `NSMicrophoneUsageDescription`, despite a microphone input feature. Add a clear purpose string and verify permission grant, denial, interruption, and recovery on device. Apple documents the key [here](https://developer.apple.com/documentation/bundleresources/information-property-list/nsmicrophoneusagedescription).
3. **Update Capacitor security and native configuration.** Installed `@capacitor/ios` 6.2.1 is affected by [GHSA-rvm3-566m-v7fv](https://github.com/advisories/GHSA-rvm3-566m-v7fv), fixed in 6.2.2 and newer patched release lines. A rebuilt native app is required. Align all Capacitor packages, Podfile/project targets, and the Capacitor app ID (`com.replay.app`) with the existing installed bundle ID (`com.playbk.app`); preserve the existing identity unless intentionally replacing the app. Replace the temporary deployment override with saved settings.
4. **Improve MIDI lifecycle.** Native notifications connect newly discovered sources but do not publish source changes to JavaScript. Removed sources remain in `connectedSources`; CoreMIDI connection errors are ignored. Repeated `start` calls recreate clients/ports without disposing existing ones. The web polyfill exposes one input named after the first source while native code connects every source. Add idempotent start/stop, explicit errors, source change events, and stable selection semantics. Verify FP-10 connection, unplug/replug, reconnect, and foreground return. Preserve the previously added plain-facade fix for the Capacitor Promise/proxy issue.
5. **Restore useful checks.** Replace the missing Playwright wrapper with native configuration; add targeted MIDI, microphone, and iPad layout smoke tests. Ignore generated/native dependency directories and the Python environment in lint. Add scripts for type checking and tests, then CI for build/type/lint/test.

## Modern target

Proposed baseline: Node 24 LTS, current Chrome/Edge/Firefox/Safari, and iOS/iPadOS 18.6+ (the existing app target), tested additionally on the connected device's current OS. This baseline is a recommendation, not an implemented compatibility change.

Use Capacitor 8.5.x with matching package versions after checking exact CLI availability. npm's `latest` tag currently reports CLI 7.6.9 while core/iOS report 8.5.2, so blindly installing every package's `latest` would mix major versions. Capacitor 8 requires Node 22+ and Xcode 26+; follow both [8.0 migration](https://capacitorjs.com/docs/updating/8-0) and [8.5 migration](https://capacitorjs.com/docs/updating/8-5). Consider Swift Package Manager to remove the CocoaPods setup dependency. Revisit the version-specific Capacitor patch, which only suppresses a WKProcessPool deprecation warning.

## Package update candidates

Registry snapshot at review time; these targets still require compatibility and peer-dependency checks.

| Package | Installed | Candidate |
| --- | --- | --- |
| Vite | 7.3.0 | 7.3.7 security/maintenance first, or 8.3.3 migration |
| Capacitor core/iOS | 6.2.1 | 6.2.2 immediate patch; coordinated 8.5.x migration |
| Supabase JS | 2.86.0 | 2.109.0 |
| Playwright | 1.57.0 | 1.63.0 |
| TypeScript | 5.8.3 | 5.9.3 first; 7.0.2 separate tooling migration |
| React / React DOM | 18.3.1 | 19.3.0, coordinated with rendering dependencies |
| Pixi React | 7.1.2 | 8.0.5, coordinated with Pixi/filter APIs |
| Pixi JS | 8.16.0 | 8.22.0 |
| OpenSheetMusicDisplay | 1.9.5 | 1.9.9 first; 2.2.0 separate notation migration |

Vite 8 changes the bundler: follow its [migration guide](https://vite.dev/guide/migration.html). Pixi React 7 currently brings Pixi 7 modules alongside direct Pixi JS 8; decide on one renderer generation, remove unused direct dependencies, and validate graphics before changing React. See [Pixi React 8](https://pixijs.com/blog/pixi-react-v8-live).

## Product and performance tweaks

- Split sheet rendering, editors, and AI features into lazy chunks. Improve initial loading and memory use on both platforms rather than simply increasing the bundle warning limit.
- Load Magenta only when requested. It currently injects a full CDN UMD bundle at startup and fetches remote checkpoints. The package tree also contains multiple Tone generations. Review the old Magenta/protobuf dependency chain: audit offers no automatic fix for some of it. Replacing or isolating that feature may be more useful than carrying it forward.
- Use dynamic viewport sizing and all required safe-area edges. Currently the root uses `h-screen`/overflow hidden and only top safe-area padding. Test portrait, landscape, browser toolbar changes, and iPad window resizing before claiming layout bugs are resolved.
- Restore pinch zoom for accessibility where appropriate; the viewport currently disables user scaling. Keep precise touch behavior scoped to the piano.
- Add a visible connection state and selected MIDI device, with actionable native errors rather than mapping every failure to “No devices”.
- Consider offline caching for practice assets and notation. The manifest exists, but there is no service-worker registration; AI models and libraries still depend on remote URLs.
- Replace stale iPad runbook sections that say the native wrapper and MIDI bridge are missing. Document build/install/versioning and actual device verification.

Recommended implementation order: functional/security fixes and checks; coherent modern toolchain/native baseline; graphics/audio migrations; startup performance and tablet usability. No application updates were applied during this review.

## Implementation after approval

- Established Node 24 and iOS/iPadOS 18.6 as the baseline.
- Updated Capacitor core, CLI, and iOS together to 8.5.2; Vite to 8.3.3 with React plugin 6.1.2; React Router to 7.18.4; Supabase to 2.117.2; TypeScript to 5.9.3; Playwright to 1.63.0; OpenSheetMusicDisplay to 1.9.9. Updated compatible releases in the lockfile.
- Repaired microphone worklet compilation using Vite's worker URL pipeline. Actual emitted JavaScript is loaded in an AudioContext and tested for PCM delivery in Chromium and WebKit.
- Added the native microphone purpose string, scene lifecycle, saved deployment targets, consistent existing bundle identity, and measured safe-area updates instead of a fixed 24px inset. Removed the obsolete Capacitor 6 warning patch.
- Made native MIDI startup idempotent, surfaced CoreMIDI errors, removed disappeared sources, published hotplug changes to the web app, closed the native connection on disconnect, and refreshed sources on resume. Read variable-length MIDI packets directly rather than copying them into a fixed-size struct. MIDI remains an aggregate virtual input rather than a device-selection UI.
- Deferred notation rendering and quest editing until needed while retaining mounted editor state after first use. Made AI libraries load on demand, including MIDI/MusicXML import paths, with shared requests, timeout, and retry handling.
- Removed unused direct Pixi 8 and Magenta Node dependencies. The current renderer consistently uses Pixi 7 modules with React 18. Local types describe the small API consumed from the external Magenta UMD runtime; that external runtime itself has not been replaced or security-audited.
- Replaced broken Playwright configuration; added ten production browser checks across Chromium and iPad WebKit, covering microphone PCM, MIDI hotplug/close, AI loader retries, layout, routing, and deferred editor loading. Database requests are mocked so tests do not mutate the live project. Added CI and typecheck/check scripts.
- Fixed lint errors and excluded generated dependencies/environments. Lint passes with existing hook/fast-refresh warnings. Updated native build documentation and removed redundant CocoaPods installation from the sync script.
- The main JavaScript chunk fell from 9,045 kB to 7,045 kB (about 22%). Vite's web build now takes around two seconds on this machine. Tune assets are still eagerly bundled and remain a substantial optimization opportunity.
- Dependency audit fell from 56 affected entries (3 critical) to 12 (0 critical, 5 high, 7 moderate). Remaining entries are Tailwind-related build dependencies and Capacitor CLI xcode/uuid tooling. A Tailwind 4 migration and coordinated React 19/Pixi 8 migration remain separate work; they were not forced into this update.
- Verified the iOS app builds for Bouba using saved settings, without deployment overrides. Browser simulation validates JavaScript behavior, not physical USB MIDI reconnection, microphone permission/interruption behavior, or native inset appearance. Verify those on the iPad using the current runbook.
- Installed and launched the new build successfully on Bouba after unlocking the iPad.

The updated web source is local; it has not been published to the hosted web app. The implementation is included in the modernization commit and pull request.
