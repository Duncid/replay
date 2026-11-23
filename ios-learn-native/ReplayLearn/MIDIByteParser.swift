import Foundation

/// MIDI 1.0 messages inside a packet, including running status and real-time bytes.
/// Stateless across packets: CoreMIDI sources deliver complete MIDI messages.
enum MIDIByteParser {
    struct NoteEvent: Equatable { let pitch: Int; let velocity: Int }
    static func parse(_ bytes: [UInt8]) -> [NoteEvent] {
        var status: UInt8 = 0, data: [UInt8] = [], events: [NoteEvent] = []
        for byte in bytes {
            if byte >= 0xF8 { continue }
            if byte >= 0x80 { status = byte < 0xF0 ? byte : 0; data = []; continue }
            guard status != 0 else { continue }
            data.append(byte)
            let kind = status & 0xF0
            let length = kind == 0xC0 || kind == 0xD0 ? 1 : 2
            if data.count == length {
                if kind == 0x90 || kind == 0x80 {
                    events.append(NoteEvent(pitch: Int(data[0]), velocity: kind == 0x90 ? Int(data[1]) : 0))
                }
                data = []
            }
        }
        return events
    }
}
