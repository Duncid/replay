# Replay for iOS / iPadOS

The native app uses Capacitor 8.5, a scene lifecycle, and a custom CoreMIDI bridge. The installed bundle identity is `com.playbk.app`. The minimum supported iOS/iPadOS version is **26.2**.

## Build

Use Node 24 (`nvm install && nvm use`), Xcode 26 or later, and CocoaPods 1.16.2 with a supported Ruby. Avoid relying on macOS's old system Ruby for a fresh CocoaPods installation.

```sh
npm ci
npm run check
npm run ios
```

`cap sync ios` copies the web assets and runs CocoaPods; a second `pod install` is unnecessary. Open `ios/App/App.xcworkspace`, select your signing team/device, and build. `./sync-ios.sh` checks CocoaPods availability before building, syncing, and opening Xcode.

For a command-line build:

```sh
xcodebuild -workspace ios/App/App.xcworkspace -scheme App \
  -configuration Debug -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/replay-ipad-build -allowProvisioningUpdates build
```

No deployment-target override is required.

## Install on a paired iPad

```sh
xcrun devicectl list devices
xcrun devicectl device install app --device YOUR_DEVICE_ID \
  /tmp/replay-ipad-build/Build/Products/Debug-iphoneos/App.app
xcrun devicectl device process launch --device YOUR_DEVICE_ID com.playbk.app
```

If iPadOS requires developer trust, use Settings → General → VPN & Device Management on the iPad.

## iPad screen space

Replay hides the iPad status bar (clock, date, Wi-Fi and battery) through the view controller's `prefersStatusBarHidden`. The existing safe-area bridge follows UIKit's actual insets, so the web layout reclaims that space without hard-coded offsets. Other device types retain Capacitor's default status-bar behavior.

## Input verification

- USB MIDI: power on the piano and use its USB COMPUTER port. Tap Connect MIDI. Play notes; unplug/replug and verify the device state updates and notes resume. Replay aggregates native CoreMIDI sources into one virtual input.
- MIDI sound: use the “…” menu beside the connected keyboard. “Play on keyboard” routes app playback and screen keys to the available MIDI output; “Silent while I play” mutes iPad audio for incoming keyboard notes. Both are manual and remembered per device. Physical notes are never echoed back to the keyboard. Test note release when switching output off and disconnecting.
- Microphone: select microphone input, grant permission, and verify levels and recognized notes. Then test denial and background/foreground interruption recovery on the physical device.
- Test portrait, landscape, and resized iPad windows. Browser WebKit tests cover layout and audio worklet behavior; they do not replace physical-device MIDI or microphone permission testing.

The web/PWA version uses browser Web MIDI where available. Safari's lack of Web MIDI is shown explicitly; USB MIDI on iPad uses the native wrapper.

## Modern web runtime

The web bundle targets Safari 26.2+, Chrome 130+, and Firefox 128+. Tailwind 4 uses the Vite integration. React 19 uses the stable Babel React Compiler, PixiJS 8, and DayPicker 9. Local music assets load per tune and remain packaged in the native app for offline use.

## Opt-in physical-device performance probe

Debug builds support the current student library → tune demo → Note Highway flow:

```sh
xcrun devicectl device process launch --terminate-existing --console \
  --device YOUR_DEVICE_ID com.playbk.app --replay-performance \
  --performance-notes=200 --performance-seconds=8 --performance-full
```

Remove `--performance-full` for the compact keyboard. Note counts are 200, 1000, or 5000; sample duration is 2–20 seconds. Keep the iPad unlocked, awake, and in the foreground. The probe supplies local fixtures, blocks Cloud functions, restores saved mode/instrument preferences, and emits JSON tagged `[Replay Performance]`. It is injected only for this explicit Debug launch; normal launches do not load it. Fixture network isolation remains until reload. When launching manually, relaunch without probe arguments after completion to return to normal use.

For repeatable runs across both independently built apps, use:

```sh
python3 scripts/measure-ipad-performance.py --device YOUR_DEVICE_ID \
  --platform both --notes 200 1000 5000 --layouts compact full \
  --repeats 3 --output /tmp/replay-performance-baseline
```

Build and install each app first. The runner does not build or install; it saves per-run console logs and `measurements.json`, fails on probe errors/timeouts, and relaunches each app normally afterward. See [the performance methodology and baseline](../docs/ipad-performance.md). For browser validation, run `npm run build` then `npm run perf:web`; this uses the same web probe and writes JSON attachments under `performance-results/`.


### Launch artwork and icons

The launch storyboard uses a centered Replay wordmark and the plain white/black piano. The wordmark is rasterized from Space Grotesk at 80 points; individual key images use 9-part slicing so their corners stay intact as Auto Layout adapts the keyboard width. Short windows can reduce the key height to avoid covering the wordmark. This target owns its storyboard and image assets independently.

Both targets use the existing opaque blue piano icon at 1024px; Xcode derives the device icon sizes. Exported icon sizes, portrait/landscape start screens, and a size/source manifest live in `design-assets/ipad-release/`. Run `npx storybook build -o dist/storybook`, serve the build on port 8082, then `node scripts/export-ipad-assets.mjs`. The exporter also refreshes native launch assets, storyboards, and the existing web icon URLs. Start-screen PNGs are review/export assets; the native launch screen does not stretch a full-screen screenshot.
