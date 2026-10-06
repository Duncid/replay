# Replay for iOS / iPadOS

The native app uses Capacitor 8.5, a scene lifecycle, and a custom CoreMIDI bridge. The installed bundle identity is `com.playbk.app`. The minimum supported iOS/iPadOS version is **18.6**.

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

## Input verification

- USB MIDI: power on the piano and use its USB COMPUTER port. Tap Connect MIDI. Play notes; unplug/replug and verify the device state updates and notes resume. Replay aggregates native CoreMIDI sources into one virtual input.
- Microphone: select microphone input, grant permission, and verify levels and recognized notes. Then test denial and background/foreground interruption recovery on the physical device.
- Test portrait, landscape, and resized iPad windows. Browser WebKit tests cover layout and audio worklet behavior; they do not replace physical-device MIDI or microphone permission testing.

The web/PWA version uses browser Web MIDI where available. Safari's lack of Web MIDI is shown explicitly; USB MIDI on iPad uses the native wrapper.
