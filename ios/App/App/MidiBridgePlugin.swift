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
        // NSLog("[MIDI Bridge] [DEBUG] MidiBridgePlugin init() - plugin instance created")
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
        // NSLog("===== [MIDI Bridge] [DEBUG] ping() ENTRY - plugin is loaded and reachable =====")
        call.resolve(["ok": true, "message": "MidiBridge loaded"])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self, let webView = self.bridge?.webView else {
                call.reject("MIDI bridge is not ready. Please reconnect.")
                return
            }
            do {
                try self.midiManager.start(webView: webView)
                call.resolve(["sources": self.midiManager.getSourceNames()])
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @objc func disconnect(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            self?.midiManager.stop()
            call.resolve()
        }
    }
}

// MARK: - MidiManager

private final class MidiManager {

    private var client: MIDIClientRef = 0
    private var inputPort: MIDIPortRef = 0
    private var connectedSources: Set<MIDIEndpointRef> = []
    private weak var webView: WKWebView?

    /// Thread-safe buffer + single main-queue flush to avoid one evaluateJavaScript per packet.
    private let pendingLock = NSLock()
    private var pendingPackets: [[UInt8]] = []
    private var flushScheduled = false

    func start(webView: WKWebView) throws {
        self.webView = webView
        if client != 0 && inputPort != 0 {
            try connectAllSources()
            return
        }
        // print("[MIDI Bridge] [DEBUG] MidiManager.start ENTRY, webView is nil:", webView == nil)

        var result = MIDIClientCreateWithBlock("Replay MIDI" as CFString, &client) { [weak self] message in
            self?.handleNotify(message)
        }
        guard result == noErr else {
            throw midiError("Create MIDI client", status: result)
        }

        result = MIDIInputPortCreateWithBlock(client, "Replay Input" as CFString, &inputPort) { [weak self] packetList, _ in
            self?.handlePacketList(packetList)
        }
        guard result == noErr else {
            stop()
            throw midiError("Create MIDI input", status: result)
        }
        // print("[MIDI Bridge] [DEBUG] MidiManager.start: CoreMIDI client and port created OK")

        do {
            try connectAllSources()
        } catch {
            stop()
            throw error
        }
    }

    private func midiError(_ operation: String, status: OSStatus) -> NSError {
        NSError(domain: "ReplayMIDI", code: Int(status), userInfo: [
            NSLocalizedDescriptionKey: "\(operation) failed (CoreMIDI \(status)). Reconnect your piano."
        ])
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
            DispatchQueue.main.async { [weak self] in
                guard let self, self.inputPort != 0 else { return }
                do {
                    try self.connectAllSources()
                    self.publishSourceNames()
                } catch {
                    NSLog("[MIDI Bridge] %@", error.localizedDescription)
                }
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

    private func connectAllSources() throws {
        let sources = Set((0..<MIDIGetNumberOfSources()).map { MIDIGetSource($0) })
        for source in connectedSources.subtracting(sources) {
            MIDIPortDisconnectSource(inputPort, source)
            connectedSources.remove(source)
        }
        for source in sources.subtracting(connectedSources) {
            let status = MIDIPortConnectSource(inputPort, source, nil)
            guard status == noErr else {
                throw midiError("Connect to \(getName(for: source))", status: status)
            }
            connectedSources.insert(source)
        }
    }

    private func publishSourceNames() {
        guard let webView,
              let json = try? JSONSerialization.data(withJSONObject: getSourceNames()),
              let sources = String(data: json, encoding: .utf8) else { return }
        webView.evaluateJavaScript("window.__dispatchIOSMidiSources?.(\(sources));")
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

        let firstPacketPtr = UnsafeRawPointer(packetList).advanced(by: 4).assumingMemoryBound(to: MIDIPacket.self)
        var currentPtr = UnsafeMutablePointer<MIDIPacket>(mutating: firstPacketPtr)

        for i in 0..<numPackets {
            let length = Int(currentPtr.pointee.length)
            if length > 0 {
                // Read the original variable-length packet, rather than a
                // copied Swift struct whose data tuple holds only 256 bytes.
                let offset = MemoryLayout<MIDIPacket>.offset(of: \MIDIPacket.data)
                    ?? (MemoryLayout<MIDITimeStamp>.size + MemoryLayout<UInt16>.size)
                let bytes = UnsafeRawPointer(currentPtr).advanced(by: offset).assumingMemoryBound(to: UInt8.self)
                parseMidiPacketData(bytes, length: length, emit: { [weak self] in
                    self?.enqueuePacketForWeb($0)
                })
            }
            if i < numPackets - 1 {
                currentPtr = MIDIPacketNext(currentPtr)
            }
        }
    }

    /// Full scan of one CoreMIDI `MIDIPacket` payload: running status, multiple messages, SysEx skip.
    /// Running status resets at each packet boundary (per packet is safer for USB bursts).
    private func parseMidiPacketData(_ data: UnsafePointer<UInt8>, length: Int, emit: ([UInt8]) -> Void) {
        var i = 0
        var runningStatus: UInt8 = 0

        while i < length {
            let b = data[i]

            // System real-time (single byte) — may appear between channel messages
            if b >= 0xF8 {
                i += 1
                continue
            }

            // SysEx: skip until EOX 0xF7
            if b == 0xF0 {
                i += 1
                while i < length && data[i] != 0xF7 {
                    i += 1
                }
                if i < length { i += 1 }
                runningStatus = 0
                continue
            }

            // Other system common (0xF1–0xF7)
            if b >= 0xF1 && b <= 0xF7 {
                switch b {
                case 0xF1, 0xF3:
                    i += 1
                    if i < length { i += 1 }
                case 0xF2:
                    i += 1
                    if i + 1 < length {
                        i += 2
                    } else {
                        i = length
                    }
                default:
                    i += 1
                }
                runningStatus = 0
                continue
            }

            let status: UInt8
            if (b & 0x80) != 0 {
                status = b
                runningStatus = status
                i += 1
            } else {
                guard runningStatus != 0 else {
                    i += 1
                    continue
                }
                status = runningStatus
            }

            let high = status & 0xF0

            switch high {
            case 0x80, 0x90, 0xA0, 0xB0:
                guard i + 1 < length else { return }
                let d1 = data[i]
                let d2 = data[i + 1]
                emit([status, d1, d2])
                i += 2

            case 0xC0, 0xD0:
                guard i < length else { return }
                let d1 = data[i]
                emit([status, d1, 0])
                i += 1

            case 0xE0:
                guard i + 1 < length else { return }
                let d1 = data[i]
                let d2 = data[i + 1]
                emit([status, d1, d2])
                i += 2

            default:
                runningStatus = 0
                if i < length { i += 1 }
            }
        }
    }

    private func enqueuePacketForWeb(_ bytes: [UInt8]) {
        guard bytes.count == 3, webView != nil else {
            if webView == nil {
                // print("[MIDI Bridge] enqueuePacketForWeb skipped: webView is nil")
            }
            return
        }
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

        // NSLog("[MIDI Bridge] FLUSH_TO_WEB count=%lu jsLen≈%lu", batch.count, UInt(parts.joined(separator: ",").utf8.count + 80))

        let js = "window.__dispatchIOSMidiMessageBatch && window.__dispatchIOSMidiMessageBatch([" + parts.joined(separator: ",") + "]);"
        wv.evaluateJavaScript(js) { [weak self] _, error in
            // if let err = error {
            //     NSLog("[MIDI Bridge] evaluateJavaScript ERROR: %@", String(describing: err))
            // }
            _ = error
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
