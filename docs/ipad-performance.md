# iPad performance verification

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
