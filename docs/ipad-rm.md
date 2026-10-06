# iPad runbook

The Capacitor wrapper and native CoreMIDI bridge are implemented. See [the current iOS build and device runbook](../ios/README.md) for requirements, signing, build, install, and input checks.

The app uses Node 24, Capacitor 8.5, and the iOS scene lifecycle. iOS/iPadOS 18.6 is the minimum. `com.playbk.app` is the existing installed app identity.

After web changes, run `npm run check`, then `npm run ios` to build web assets, sync native dependencies, and open Xcode. Install a freshly signed native build to update the iPad. Publishing the web app alone does not update its bundled native assets.

For device logs, launch with:

```sh
xcrun devicectl device process launch --terminate-existing --console \
  --device YOUR_DEVICE_ID com.playbk.app
```

Verify USB MIDI connection and unplug/replug using the piano's USB COMPUTER port. Verify microphone permissions separately. AI and MusicXML conversion fetch external libraries/models on demand, so those features still need an internet connection.
