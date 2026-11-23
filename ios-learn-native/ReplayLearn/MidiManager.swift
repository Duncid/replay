import CoreMIDI
import Foundation

/// CoreMIDI input manager. Aggregates all connected sources (e.g. a piano's
/// USB COMPUTER port) into note-on / note-off callbacks.
@MainActor
final class MidiManager: ObservableObject {
    @Published private(set) var isConnected = false
    @Published private(set) var sourceName: String?
    @Published private(set) var sourceNames: [String] = []
    private var connectedSources: Set<MIDIEndpointRef> = []

    var onNoteOn: ((Int, Int) -> Void)?  // pitch, velocity
    var onNoteOff: ((Int) -> Void)?      // pitch

    private var client = MIDIClientRef()
    private var inputPort = MIDIPortRef()
    private var started = false

    func start() {
        guard !started else { return }
        started = true

        let status = MIDIClientCreateWithBlock("ReplayLearn" as CFString, &client) { [weak self] notification in
            guard let self else { return }
            let messageID = notification.pointee.messageID
            Task { @MainActor in
                switch messageID {
                case .msgSetupChanged:
                    self.refreshSources()
                default:
                    break
                }
            }
        }
        guard status == noErr else { started = false; return }

        let portStatus = MIDIInputPortCreateWithBlock(
            client, "ReplayLearn Input" as CFString, &inputPort
        ) { [weak self] packetList, _ in
            self?.handlePacketList(packetList)
        }
        guard portStatus == noErr else { stop(); return }

        refreshSources()
    }

    func stop() {
        guard started else { return }
        started = false
        if inputPort != 0 { MIDIPortDispose(inputPort); inputPort = 0 }
        if client != 0 { MIDIClientDispose(client); client = 0 }
        isConnected = false
        sourceName = nil
        sourceNames = []; connectedSources = []
    }

    private func refreshSources() {
        let sources = Set((0..<MIDIGetNumberOfSources()).map { MIDIGetSource($0) })
        for old in connectedSources.subtracting(sources) { MIDIPortDisconnectSource(inputPort, old) }
        for new in sources.subtracting(connectedSources) { MIDIPortConnectSource(inputPort, new, nil) }
        if !connectedSources.subtracting(sources).isEmpty { for pitch in 0...127 { onNoteOff?(pitch) } }
        connectedSources = sources
        sourceNames = Array(Set(sources.map(Self.displayName))).sorted()
        sourceName = sourceNames.first
        isConnected = !sources.isEmpty
    }

    private static func displayName(for endpoint: MIDIEndpointRef) -> String {
        var property: Unmanaged<CFString>?
        let status = MIDIObjectGetStringProperty(endpoint, kMIDIPropertyDisplayName, &property)
        if status == noErr, let property {
            return property.takeUnretainedValue() as String
        }
        return "MIDI Device"
    }

    /// Parses legacy MIDI 1.0 packet lists; note-on/off only. Runs on a CoreMIDI
    /// queue — hops to MainActor for the callbacks.
    private nonisolated func handlePacketList(_ packetListPtr: UnsafePointer<MIDIPacketList>) {
        // Walk the original variable-length packet list, never a copied packet.
        let packetOffset = MemoryLayout<MIDIPacketList>.offset(of: \.packet)!
        var packet = UnsafeRawPointer(packetListPtr).advanced(by: packetOffset).assumingMemoryBound(to: MIDIPacket.self)
        do {
            for _ in 0..<packetListPtr.pointee.numPackets {
                let offset = MemoryLayout<MIDIPacket>.offset(of: \.data)!
                let data = UnsafeRawPointer(packet).advanced(by: offset).assumingMemoryBound(to: UInt8.self)
                let bytes = Array(UnsafeBufferPointer(start: data, count: Int(packet.pointee.length)))
                let events = MIDIByteParser.parse(bytes)
                Task { @MainActor [weak self] in
                    for event in events {
                        if event.velocity > 0 { self?.onNoteOn?(event.pitch, event.velocity) }
                        else { self?.onNoteOff?(event.pitch) }
                    }
                }
                packet = UnsafePointer(MIDIPacketNext(packet))
            }
        }
    }
}
