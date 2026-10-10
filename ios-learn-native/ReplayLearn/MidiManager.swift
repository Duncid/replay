import CoreMIDI
import Foundation

/// CoreMIDI input manager. Aggregates all connected sources (e.g. a piano's
/// USB COMPUTER port) into note-on / note-off callbacks.
@MainActor
final class MidiManager: ObservableObject {
    @Published private(set) var isConnected = false
    @Published private(set) var sourceName: String?

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
        guard status == noErr else { return }

        let portStatus = MIDIInputPortCreateWithBlock(
            client, "ReplayLearn Input" as CFString, &inputPort
        ) { [weak self] packetList, _ in
            self?.handlePacketList(packetList)
        }
        guard portStatus == noErr else { return }

        refreshSources()
    }

    func stop() {
        guard started else { return }
        started = false
        if inputPort != 0 { MIDIPortDispose(inputPort); inputPort = 0 }
        if client != 0 { MIDIClientDispose(client); client = 0 }
        isConnected = false
        sourceName = nil
    }

    private func refreshSources() {
        var connectedName: String?
        for index in 0..<MIDIGetNumberOfSources() {
            let source = MIDIGetSource(index)
            MIDIPortConnectSource(inputPort, source, nil)
            if connectedName == nil {
                connectedName = Self.displayName(for: source)
            }
        }
        isConnected = connectedName != nil
        sourceName = connectedName
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
        let packetList = packetListPtr.pointee
        var packet = packetList.packet
        for _ in 0..<packetList.numPackets {
            let length = Int(packet.length)
            if length >= 3 {
                let status = packet.data.0 & 0xF0
                let data1 = Int(packet.data.1)
                let data2 = Int(packet.data.2)
                switch status {
                case 0x90 where data2 > 0: // note on
                    Task { @MainActor [weak self] in self?.onNoteOn?(data1, data2) }
                case 0x80, 0x90: // note off (or note on with velocity 0)
                    Task { @MainActor [weak self] in self?.onNoteOff?(data1) }
                default:
                    break
                }
            }
            packet = MIDIPacketNext(&packet).pointee
        }
    }
}
