# Note Highway performance: phase one

Phase one establishes a reproducible baseline before changing audio scheduling or rendering. Both apps retain their existing playback and scoring behavior. The old probe assumed four tabs and measured a legacy canvas; schema 2 now exercises the student library and the Note Highway.

## Reproducing a measurement

Build/install current Debug versions of Replay and Replay Nat, then use the commands in [the iOS README](../ios/README.md#opt-in-physical-device-performance-probe). Replay Nat accepts the same launch arguments with bundle ID `com.playbk.learn`. Its probe is compiled only in Debug and uses an isolated preview model; no real acquisitions, attempts, or resume data are changed.

The workload is identical in musical content on both platforms: two notes every 250 ms, 200 ms durations, velocity 90, pitches cycling through MIDI 48–72. Each run contains 200, 1000, or 5000 total notes. Within each platform, the first eight seconds have the same visible density; larger counts expose costs from loading and retaining long sequences. This is a long-sequence stress test, not a dense-chord stress test. Each platform renders its production practice UI, toolbar blur, rail, and keyboard. Compact keyboard ranges differ between platforms; full mode uses all 88 keys.

Collect three launches per count/layout, with fixed orientation and device settings. Keep reduced motion, Low Power Mode, external displays, MIDI connections, and thermal conditions consistent. The native records include thermal state, Low Power Mode, and screen refresh capability; the web records include viewport, device scale, and reduced-motion preference. The runner records source revision, working-tree state, and source fingerprints, and saves per-scenario medians alongside raw records. Run the same build configuration and workload before comparing changes. Do not compare an emulator with a physical device or these instrumented Debug builds with Release numbers.

## What the numbers mean

- **Tune ready:** selection to the first ready highway. Web uses the renderer readiness attribute; native uses SpriteKit presentation readiness. This fixture removes network variability. It does not measure real tune-coach network latency.
- **Ready to audio:** readiness to the first demo audio dispatch. It includes the deliberate one-second preparation delay. Native may need an additional presentation frame after switching to demo mode.
- **Frame cadence:** animation-frame intervals on web, SpriteKit frame callback intervals on native. p50/p95/p99, maximum, and counts over 25/50 ms expose stalls. These callbacks are proxies for visual cadence, not GPU presentation timestamps.
- **CPU work:** web p95 aggregates instrumented requestAnimationFrame callback work; native p95 measures scene update CPU time. These have different scopes and must not be compared directly. Neither measures GPU/compositor work.
- **Audio:** web reports relative scheduled-onset spacing error against the fixture, anchored at the first note. Native reports dispatch error against the audio render clock. Neither is acoustic output latency or a direct measurement of audible audio/visual alignment. A loopback/microphone recording is required for that.
- **Unsupported metrics:** WebKit does not expose long-task entries or JS heap size here; these fields are `null`, not zero. Native memory and GPU counters are not collected. Use Instruments for those follow-up measurements.

The probe adds overhead: timestamps, bounded arrays, and final JSON serialization. Sampling excludes startup and the deliberate lead-in. No performance pass/fail thresholds are imposed on shared CI machines; browser tests validate probe completion, readiness gating, and preference restoration. Physical measurements provide the baseline for later optimization work.

## Phase boundaries

1. **This change:** repeatable probes, deterministic workloads, device measurements, documented limitations.
2. Audio lookahead scheduling and cancellation, with native host-time scheduling and MIDI timestamps.
3. Keep the web Pixi renderer alive and pool only the needed visible density; reduce native scanning/layout work where measurements justify it.
4. Clean up completed playback voices and verify longer-session resource stability.

Later phases are not implemented by the probe work.

## Current physical-device baseline

Measured on 2026-11-23 on the USB-connected iPad Air 13-inch (M4), iPadOS 27.2.1 (24B156), landscape, 60 Hz maximum display refresh. These are repeated instrumented Debug launches with warm system caches, eight seconds per run, three runs per scenario. They are not cold-install or Release benchmarks.

The web matrix is complete: all 18 runs sustained approximately 60 fps with no observed frame interval above 17 ms. Median tune-ready latency was 157–160 ms for 200 notes, 174–177 ms for 1000, and 246–252 ms for 5000. Web rAF callback work p95 was 2–3 ms. Raw records and per-scenario medians: [web baseline JSON](performance/2026-11-23-web.json).

| Notes | Keyboard | Replay fps | Replay Nat fps | Native frame p95 | Native tune ready |
| ---: | --- | ---: | ---: | ---: | ---: |
| 200 | compact | 60.0 | 55.0 | 36.5 ms | 245 ms |
| 200 | full | 60.0 | 33.6 | 88.1 ms | 360 ms |
| 1000 | compact | 60.0 | 54.0 | 38.1 ms | 719 ms |
| 1000 | full | 60.0 | 30.2 | 89.5 ms | 991 ms |
| 5000 | compact | 60.0 | 21.8 | 84.6 ms | 3104 ms |
| 5000 | full | 60.0 | 13.3 | 122.9 ms | 4139 ms |

These are medians of three runs per cell. Replay Nat reports a 60 Hz display, not 120 Hz. Native thermal state stayed nominal and Low Power Mode/reduced motion were off. Raw records: [native baseline JSON](performance/2026-11-23-native.json).

The native full-keyboard scene is **2704 × 692 points**, compared with **1590 × 692** compact. Replay's canvas is **3164 × 1484 backing pixels** in both modes (1582 × 742 CSS pixels at scale 2). The two production layouts therefore do not have equal rendering workloads. The native full-width scroll surface is a specific candidate for viewport-bounded rendering; these measurements alone do not prove it is the cause.

Native scene-update CPU p95 ranges from about **0.55–0.61 ms** at 200 notes to **3.53–3.67 ms** at 5000. This is much shorter than the observed long frame intervals. Native console logs also contain `SKView: no drawables available for rendering` messages. Investigate SpriteKit presentation/compositing and surrounding UI work, including the full-keyboard surface, alongside per-note scanning. GPU attribution requires Instruments; low scene-update CPU does not prove a GPU-only bottleneck.

Median web relative audio-spacing p95 is **5–16 ms** across scenarios; the median maximum error per run is **5–16 ms**. Native audio dispatch p95 is roughly **53–103 ms**, rising under the heavier rendering load. These differently anchored metrics are not a direct audio-quality comparison. They do support proceeding with clock-based lookahead/host-time scheduling and measuring it again under the same stress load. The one-second preparation gate remained intact on both platforms.

Validation: all 12 browser workload/layout combinations passed across Chromium and iPad WebKit; normal web readiness and switch regressions passed; native pure geometry/scoring/MIDI/progression checks, native audio/flow smoke tests, and Debug/Release builds passed. Both physical apps were returned to normal launches after their samples.


---

## Historical legacy-canvas measurements

These figures predate the Note Highway. They are retained for provenance and are not a before/after comparison with schema 2.


Measured on 2026-10-08 on the paired iPad Air 13-inch (M4), running iPadOS 26.7.1. Replay uses React 19.3, PixiJS 8.22, Tailwind 4.3, and the Babel React Compiler. The final Debug build was installed and launched normally after the measurements.

The opt-in `--replay-performance` probe ran three times, terminating the previous process before each launch. These are repeat launches with warm system caches, not first-ever launches or Release-build benchmarks. The saved active-mode preference was restored after each run.

| Metric | Run 1 | Run 2 | Run 3 | Median |
| --- | ---: | ---: | ---: | ---: |
| Native launch callback to UI readiness | 344 ms | 275 ms | 260 ms | 275 ms |
| Web navigation to UI readiness | 257 ms | 186 ms | 175 ms | 186 ms |
| Tune tab activation to ready canvas | 655 ms | 701 ms | 973 ms | 701 ms |
| Playback frame interval, median | 17 ms | 17 ms | 17 ms | 17 ms |
| Playback frame interval, p95 | 17 ms | 17 ms | 17 ms | 17 ms |
| Playback frame interval, p99 | 18 ms | 17 ms | 18 ms | 18 ms |
| Playback frame intervals over 50 ms | 0 | 0 | 0 | 0 |

Each playback sample covered eight seconds and 480 animation frames, approximately 60 fps. UI readiness means the tabs and piano key elements exist and two animation frames have elapsed. Native timing starts at `application(_:didFinishLaunchingWithOptions:)`; it excludes time before that callback. Tune readiness includes asset loading and canvas initialization. Frame timing measures visual scheduling, not end-to-end MIDI or microphone-to-audio latency. No physical-device measurements of the pre-upgrade build were collected, so these numbers do not establish a measured startup speedup.

Validation also passed TypeScript checking, ESLint (existing warnings remain), 16 Playwright tests in Chromium and iPad WebKit, separate calendar navigation/date-selection checks in both engines, and the native Xcode build. Browser playback verification checks that the notation canvas changes during playback and that pause returns to the Play state.

See [the iOS README](../ios/README.md#opt-in-physical-device-performance-probe) for the repeatable measurement command.
