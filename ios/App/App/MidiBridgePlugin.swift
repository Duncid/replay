import Capacitor
import CoreMIDI
import Foundation
import WebKit

/// Local Capacitor plugin that bridges CoreMIDI to the web app's Web MIDI polyfill.
/// When the web calls requestAccess(), we start listening to USB MIDI devices.
/// Incoming MIDI packets are forwarded via window.__dispatchIOSMidiMessage([status, data1, data2]).
@objc(MidiBridgePlugin)
public class MidiBridgePlugin: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "MidiBridgePlugin"
    public let jsName = "MidiBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ping", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
    ]

    private let midiManager = MidiManager()

    @objc func ping(_ call: CAPPluginCall) {
        NSLog("===== [MIDI Bridge] ping() called - plugin is loaded and reachable =====")
        call.resolve(["ok": true, "message": "MidiBridge loaded"])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        let webView = bridge?.webView
        midiManager.start(webView: webView)
        if webView == nil {
            for delay in [0.1, 0.3, 0.6, 1.0] as [Double] {
                DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
                    let wv = self?.bridge?.webView
                    self?.midiManager.updateWebView(wv)
                }
            }
        }
        let sources = midiManager.getSourceNames()
        call.resolve(["sources": sources])
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        midiManager.stop()
        call.resolve()
    }
}

// MARK: - MidiManager

private final class MidiManager {

    private var client: MIDIClientRef = 0
    private var inputPort: MIDIPortRef = 0
    private var connectedSources: Set<MIDIEndpointRef> = []
    private weak var webView: WKWebView?
    private let queue = DispatchQueue(label: "com.replay.midi", qos: .userInitiated)

    func start(webView: WKWebView?) {
        self.webView = webView
        print("[MIDI Bridge] MidiManager.start, webView is nil:", webView == nil)

        var result = MIDIClientCreateWithBlock("Replay MIDI" as CFString, &client) { [weak self] message in
            self?.handleNotify(message)
        }
        guard result == noErr else { return }

        result = MIDIInputPortCreateWithBlock(client, "Replay Input" as CFString, &inputPort) { [weak self] packetList, _ in
            self?.handlePacketList(packetList)
        }
        guard result == noErr else { return }

        connectAllSources()
    }

    func updateWebView(_ newWebView: WKWebView?) {
        webView = newWebView
    }

    func stop() {
        disconnectAllSources()
        if inputPort != 0 {
            MIDIPortDispose(inputPort)
            inputPort = 0
        }
        if client != 0 {
            MIDIClientDispose(client)
            client = 0
        }
        webView = nil
    }

    private func handleNotify(_ message: UnsafePointer<MIDINotification>) {
        let msg = message.pointee
        switch msg.messageID {
        case .msgObjectAdded, .msgObjectRemoved:
            queue.async { [weak self] in
                self?.connectAllSources()
            }
        default:
            break
        }
    }

    private func getName(for endpoint: MIDIEndpointRef) -> String {
        var param: Unmanaged<CFString>?
        let err = MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &param)
        guard err == noErr, let cfStr = param?.takeRetainedValue() else {
            return "(unnamed)"
        }
        return cfStr as String
    }

    func getSourceNames() -> [String] {
        let count = MIDIGetNumberOfSources()
        var names: [String] = []
        for i in 0..<count {
            let source = MIDIGetSource(i)
            names.append(getName(for: source))
        }
        return names
    }

    private func connectAllSources() {
        let count = MIDIGetNumberOfSources()
        NSLog("===== [MIDI Bridge] connectAllSources: %d MIDI source(s) =====", count)
        for i in 0..<count {
            let source = MIDIGetSource(i)
            let name = getName(for: source)
            NSLog("[MIDI Bridge]   source[%d]: %@", i, name)
            if !connectedSources.contains(source) {
                MIDIPortConnectSource(inputPort, source, nil)
                connectedSources.insert(source)
            }
        }
    }

    private func disconnectAllSources() {
        for source in connectedSources {
            MIDIPortDisconnectSource(inputPort, source)
        }
        connectedSources.removeAll()
    }

    private func handlePacketList(_ packetList: UnsafePointer<MIDIPacketList>) {
        let list = packetList.pointee
        let numPackets = list.numPackets
        guard numPackets > 0 else { return }

        // Packet data starts after numPackets (4 bytes) in MIDIPacketList
        let firstPacketPtr = UnsafeRawPointer(packetList).advanced(by: 4).assumingMemoryBound(to: MIDIPacket.self)
        var currentPtr = UnsafeMutablePointer<MIDIPacket>(mutating: firstPacketPtr)

        for i in 0..<numPackets {
            let packet = currentPtr.pointee
            let length = Int(packet.length)
            if length >= 3 {
                withUnsafePointer(to: packet) { ptr in
                    let bytesPtr = UnsafeRawPointer(ptr).advanced(by: 10).assumingMemoryBound(to: UInt8.self)
                    forwardToWeb([bytesPtr[0], bytesPtr[1], bytesPtr[2]])
                }
            }
            if i < numPackets - 1 {
                currentPtr = MIDIPacketNext(currentPtr)
            }
        }
    }

    private static var forwardLogCount = 0

    private func forwardToWeb(_ bytes: [UInt8]) {
        guard webView != nil else {
            print("[MIDI Bridge] forwardToWeb skipped: webView is nil")
            return
        }
        Self.forwardLogCount += 1
        if Self.forwardLogCount <= 3 {
            print("[MIDI Bridge] forwardToWeb packet #\(Self.forwardLogCount): [\(bytes[0]),\(bytes[1]),\(bytes[2])]")
        }
        let js = "window.__dispatchIOSMidiMessage && window.__dispatchIOSMidiMessage([\(bytes[0]),\(bytes[1]),\(bytes[2])]);"
        DispatchQueue.main.async { [weak self] in
            self?.webView?.evaluateJavaScript(js)
        }
    }
}
