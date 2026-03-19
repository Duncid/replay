# iPadOS USB MIDI bridge for this web app

This project now includes an iPad-specific Web MIDI polyfill (`src/lib/webMidiIosPolyfill.ts`).

## Why this exists

- Safari/PWA on iPadOS does not expose `navigator.requestMIDIAccess()`.
- A native iPad wrapper (WKWebView / Capacitor) can access USB MIDI via CoreMIDI.
- The native layer forwards MIDI packets to JavaScript, where the polyfill emulates Web MIDI.

## JavaScript ↔ native contract

### JS to native

The polyfill posts messages to the WKWebView script handler named `midiBridge`:

- `{ "type": "midi/request-access" }` when `navigator.requestMIDIAccess()` is called.
- `{ "type": "midi/disconnect" }` on unload.

### Native to JS

The native layer can deliver incoming MIDI packet bytes (`[status, data1, data2]`) with either:

1. `window.__dispatchIOSMidiMessage([status, data1, data2])`, or
2. `window.dispatchEvent(new CustomEvent("ios-midi-message", { detail: { data: [status, data1, data2] } }))`.

## Minimal Swift sketch (WKWebView)

```swift
import WebKit
import CoreMIDI

final class MidiBridgeHandler: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "midiBridge",
              let body = message.body as? [String: Any],
              let type = body["type"] as? String else { return }

        switch type {
        case "midi/request-access":
            MidiManager.shared.start()
        case "midi/disconnect":
            MidiManager.shared.stop()
        default:
            break
        }
    }

    func forwardMidiPacket(_ bytes: [UInt8]) {
        guard bytes.count >= 3 else { return }
        let js = "window.__dispatchIOSMidiMessage([\(bytes[0]),\(bytes[1]),\(bytes[2])]);"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js)
        }
    }
}
```

## Capacitor notes

- Register a plugin that listens to CoreMIDI.
- In plugin code, call `bridge.webView?.evaluateJavaScript(...)` with `window.__dispatchIOSMidiMessage([...])`.
- Ensure the `WKUserContentController` has a `midiBridge` handler if you keep the same message contract.

## App-side behavior in this repo

- `src/main.tsx` imports the polyfill at startup.
- `useMidiInput` continues to use `navigator.requestMIDIAccess()` as before.
- On iPad wrapper builds with the native bridge, MIDI devices appear as a single virtual input (`iPad USB MIDI`) and feed note-on/note-off callbacks.
