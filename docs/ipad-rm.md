# iPad RM (Runbook): package, test on iMac, deploy to iPad

This runbook explains what is already present in this repo, what is still required, and how to go from local web app code to a testable iPad app.

## 1) Current status: is everything already in this repo?

Short answer: **not yet**.

What is already done:
- Web-side iPad MIDI polyfill exists (`src/lib/webMidiIosPolyfill.ts`).
- App startup imports the polyfill (`src/main.tsx`).
- MIDI hook still uses `navigator.requestMIDIAccess()` and can consume bridged events.

What is still required (native iOS side):
- An iOS wrapper project (`WKWebView` app or Capacitor iOS project).
- A native `midiBridge` script message handler.
- CoreMIDI capture + forwarding packets to JavaScript.
- Apple Developer signing setup for device install/TestFlight/App Store.

## 2) Recommended path

Use **Capacitor + iOS project + native CoreMIDI bridge** for fastest path from this Vite/React codebase.

## 3) Prerequisites on iMac

- macOS with latest stable Xcode.
- Apple ID signed into Xcode (free account for local device install; paid Developer Program for TestFlight/App Store).
- Node.js 20+ and npm.
- CocoaPods (`sudo gem install cocoapods` if not present).
- iPad + USB cable (or trusted Wi‑Fi debugging).

## 4) Build the web app

```bash
npm ci
npm run build
```

Expected output: `dist/` directory.

## 5) Create wrapper shell (Capacitor flow)

From repo root:

```bash
npm i -D @capacitor/cli
npm i @capacitor/core @capacitor/ios
npx cap init "Your App Name" "com.yourcompany.yourapp" --web-dir=dist
npx cap add ios
npx cap sync ios
npx cap open ios
```

This creates `ios/` and opens Xcode.

## 6) Implement native MIDI bridge

In Xcode iOS project:

1. Add a `WKScriptMessageHandler` named `midiBridge`.
2. Handle messages:
   - `midi/request-access` → start CoreMIDI listening.
   - `midi/disconnect` → stop listening.
3. For each incoming 3-byte MIDI packet `[status, data1, data2]`, evaluate JS in WebView:

```swift
window.__dispatchIOSMidiMessage([status, data1, data2])
```

Use the companion design notes in `docs/ipados-midi-bridge.md`.

## 7) Run on iPad from iMac

1. Connect iPad to iMac.
2. On iPad: tap **Trust This Computer**.
3. In Xcode:
   - Select your iPad as run destination.
   - Set Signing Team in target settings.
   - Build + Run.
4. First launch on device may require:
   - Settings → General → VPN & Device Management → trust developer certificate.

## 8) Validate MIDI end-to-end

Recommended test sequence:

1. Connect USB MIDI keyboard/interface to iPad (direct USB‑C or powered hub).
2. Open app on iPad.
3. Trigger app MIDI connect flow (calls `requestMIDIAccess`).
4. Verify:
   - no “Web MIDI unsupported” blocking state;
   - virtual input appears as `iPad USB MIDI` in logs;
   - note-on/off from keyboard triggers app behavior.

If no events appear:
- confirm native bridge receives CoreMIDI callbacks;
- confirm JS injection call executes without errors;
- confirm packets are integer bytes in range.

## 9) Ship to testers / App Store

For TestFlight/App Store you still need:
- Paid Apple Developer Program account.
- Bundle ID, certificates/profiles configured.
- Archive in Xcode and upload to App Store Connect.
- TestFlight internal/external testing before App Review.

## 10) Maintenance workflow for future web changes

After web code changes:

```bash
npm run build
npx cap sync ios
npx cap open ios
```

Then rebuild/run from Xcode.
