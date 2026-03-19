import Capacitor
import CoreMIDI
import Foundation
import WebKit

/// Local Capacitor plugin that bridges CoreMIDI to the web app's Web MIDI polyfill.
/// When the web calls requestAccess(), we start listening to USB MIDI devices.
/// Incoming MIDI packets are batched to window.__dispatchIOSMidiMessageBatch([[s,d1,d2],...]).
@objc(MidiBridgePlugin)
public class MidiBridgePlugin: CAPPlugin, CAPBridgedPlugin {

    public override init() {
        super.init()
        NSLog("[MIDI Bridge] [DEBUG] MidiBridgePlugin init() - plugin instance created")
    }

    public let identifier = "MidiBridgePlugin"
    public let jsName = "MidiBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ping", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disconnect", returnType: CAPPluginReturnPromise),
    ]

    private let midiManager = MidiManager()

    @objc func ping(_ call: CAPPluginCall) {
        NSLog("===== [MIDI Bridge] [DEBUG] ping() ENTRY - plugin is loaded and reachable =====")
        call.resolve(["ok": true, "message": "MidiBridge loaded"])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        NSLog("===== [MIDI Bridge] [DEBUG] requestAccess ENTRY - native Swift method invoked =====")
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
        NSLog("[MIDI Bridge] [DEBUG] requestAccess: resolving with sources: %@", sources.description)
        call.resolve(["sources": sources])
        NSLog("[MIDI Bridge] [DEBUG] requestAccess EXIT - call resolved")
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

    /// Thread-safe buffer + single main-queue flush to avoid one evaluateJavaScript per packet.
    private let pendingLock = NSLock()
    private var pendingPackets: [[UInt8]] = []
    private var flushScheduled = false

    func start(webView: WKWebView?) {
        self.webView = webView
        print("[MIDI Bridge] [DEBUG] MidiManager.start ENTRY, webView is nil:", webView == nil)

        var result = MIDIClientCreateWithBlock("Replay MIDI" as CFString, &client) { [weak self] message in
            self?.handleNotify(message)
        }
        guard result == noErr else {
            print("[MIDI Bridge] [DEBUG] MidiManager.start: MIDIClientCreateWithBlock failed, result:", result)
            return
        }

        result = MIDIInputPortCreateWithBlock(client, "Replay Input" as CFString, &inputPort) { [weak self] packetList, _ in
            self?.handlePacketList(packetList)
        }
        guard result == noErr else {
            print("[MIDI Bridge] [DEBUG] MidiManager.start: MIDIInputPortCreateWithBlock failed, result:", result)
            return
        }
        print("[MIDI Bridge] [DEBUG] MidiManager.start: CoreMIDI client and port created OK")

        connectAllSources()
    }

    func updateWebView(_ newWebView: WKWebView?) {
        webView = newWebView
    }

    func stop() {
        pendingLock.lock()
        pendingPackets.removeAll()
        flushScheduled = false
        pendingLock.unlock()

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
        NSLog("===== [MIDI Bridge] [DEBUG] connectAllSources: %d MIDI source(s) =====", count)
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
                    enqueuePacketForWeb([bytesPtr[0], bytesPtr[1], bytesPtr[2]])
                }
            }
            if i < numPackets - 1 {
                currentPtr = MIDIPacketNext(currentPtr)
            }
        }
    }

    /// Debug: log every packet from CoreMIDI (compare to web `[MIDI] Note ON/OFF` in Xcode console).
    private static func logMidiPacket(_ phase: String, _ b: [UInt8]) {
        guard b.count == 3 else {
            NSLog("[MIDI Bridge] %@ invalid len=%lu", phase, b.count)
            return
        }
        let st = b[0]
        let cmd = st & 0xF0
        let note = UInt(b[1])
        let vel = UInt(b[2])
        let kind: String
        switch cmd {
        case 0x80:
            kind = "NoteOff"
        case 0x90:
            kind = vel == 0 ? "NoteOff(vel0)" : "NoteOn"
        default:
            kind = String(format: "cmd0x%02X", cmd)
        }
        NSLog("[MIDI Bridge] %@ %@ st=0x%02X note=%u vel=%u", phase, kind, st, note, vel)
    }

    private func enqueuePacketForWeb(_ bytes: [UInt8]) {
        guard bytes.count == 3, webView != nil else {
            if webView == nil {
                print("[MIDI Bridge] enqueuePacketForWeb skipped: webView is nil")
            }
            return
        }
        Self.logMidiPacket("ENQUEUE", bytes)

        pendingLock.lock()
        pendingPackets.append(bytes)
        let shouldScheduleMain = !flushScheduled
        if shouldScheduleMain {
            flushScheduled = true
        }
        pendingLock.unlock()

        if shouldScheduleMain {
            DispatchQueue.main.async { [weak self] in
                self?.flushPendingPacketsToWeb()
            }
        }
    }

    private func flushPendingPacketsToWeb() {
        pendingLock.lock()
        let batch = pendingPackets
        pendingPackets.removeAll()
        pendingLock.unlock()

        guard !batch.isEmpty else {
            finishFlushAndRescheduleIfNeeded()
            return
        }
        guard let wv = webView else {
            finishFlushAndRescheduleIfNeeded()
            return
        }

        var parts: [String] = []
        parts.reserveCapacity(batch.count)
        for p in batch where p.count == 3 {
            parts.append("[\(p[0]),\(p[1]),\(p[2])]")
        }
        guard !parts.isEmpty else {
            finishFlushAndRescheduleIfNeeded()
            return
        }

        NSLog("[MIDI Bridge] FLUSH_TO_WEB count=%lu jsLen≈%lu", batch.count, UInt(parts.joined(separator: ",").utf8.count + 80))

        let js = "window.__dispatchIOSMidiMessageBatch && window.__dispatchIOSMidiMessageBatch([" + parts.joined(separator: ",") + "]);"
        wv.evaluateJavaScript(js) { [weak self] _, error in
            if let err = error {
                NSLog("[MIDI Bridge] evaluateJavaScript ERROR: %@", String(describing: err))
            }
            self?.finishFlushAndRescheduleIfNeeded()
        }
    }

    private func finishFlushAndRescheduleIfNeeded() {
        pendingLock.lock()
        flushScheduled = false
        let more = !pendingPackets.isEmpty
        if more {
            flushScheduled = true
        }
        pendingLock.unlock()
        if more {
            DispatchQueue.main.async { [weak self] in
                self?.flushPendingPacketsToWeb()
            }
        }
    }
}
