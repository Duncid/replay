import Foundation

// MARK: - Note sequences (mirrors src/types/noteSequence.ts)

struct Note: Codable, Equatable {
    var pitch: Int
    var startTime: Double
    var endTime: Double
    var velocity: Double?
}

struct NoteSequence: Codable, Equatable {
    var notes: [Note]
    var totalTime: Double
}

// MARK: - Generic error payload from edge functions

struct EdgeErrorPayload: Codable {
    var error: String
}

// MARK: - Published tune library and progression

struct PublishedTune: Decodable, Identifiable {
    let tune_key: String
    let note_sequence: NoteSequence?
    var id: String { tune_key }
}

struct TuneLibraryItem: Identifiable {
    let tuneKey: String
    let unlocked: Bool
    let prerequisites: [String]
    var acquired = false
    var sequence: NoteSequence? = nil
    var title: String { Self.displayTitle(tuneKey) }
    static func displayTitle(_ key: String) -> String { key.replacingOccurrences(of: "-", with: " ").replacingOccurrences(of: "_", with: " ").capitalized }
    var id: String { tuneKey }
}

struct TuneCurriculumSnapshot: Decodable {
    struct TuneNode: Decodable {
        let tuneKey: String
        let musicRef: String
    }
    struct Edge: Decodable {
        let source_key: String
        let target_key: String
        let edge_type: String
    }
    let tunes: [TuneNode]?
    let edges: [Edge]?
}

struct TuneCurriculumExport: Decodable {
    let snapshot: TuneCurriculumSnapshot
}

struct TuneAcquisition: Decodable {
    let tune_key: String
}

enum TuneAvailability {
    static func resolve(_ musicRef: String, snapshot: TuneCurriculumSnapshot?,
                        acquired: Set<String>) -> TuneLibraryItem {
        let nodes = snapshot?.tunes ?? []
        let matches = nodes.filter { $0.musicRef == musicRef }
        func completed(_ key: String) -> Bool {
            if acquired.contains(key) { return true }
            guard let node = nodes.first(where: { $0.tuneKey == key }) else { return false }
            return acquired.contains(node.musicRef)
        }
        if acquired.contains(musicRef) || matches.contains(where: { completed($0.tuneKey) }) {
            return TuneLibraryItem(tuneKey: musicRef, unlocked: true, prerequisites: [], acquired: true)
        }
        let paths = matches.map { node in
            (snapshot?.edges ?? []).filter { $0.edge_type == "tune_next" && $0.target_key == node.tuneKey }
                .map { $0.source_key }.filter { !completed($0) }
        }
        guard !paths.isEmpty, !paths.contains(where: { $0.isEmpty }),
              let shortest = paths.min(by: { $0.count < $1.count }) else {
            return TuneLibraryItem(tuneKey: musicRef, unlocked: true, prerequisites: [])
        }
        return TuneLibraryItem(tuneKey: musicRef, unlocked: false, prerequisites: shortest.map { key in
            nodes.first(where: { $0.tuneKey == key })?.musicRef ?? key
        })
    }
}

// MARK: - Tune coach and evaluation

struct TunePlanSequence: Codable {
    let noteSequence: NoteSequence?
}

struct TunePracticeItem: Codable, Identifiable {
    let itemId: String
    let itemType: String
    let instruction: String
    let nugget: TunePlanSequence?
    let assembly: TunePlanSequence?
    let fullTune: TunePlanSequence?
    var id: String { itemId }
    var sequence: NoteSequence? { nugget?.noteSequence ?? assembly?.noteSequence ?? fullTune?.noteSequence }
}

struct TuneCoachResponse: Decodable {
    let practicePlan: [TunePracticeItem]
    let encouragement: String?
    let tuneTitle: String
}

struct TuneEvaluationResponse: Decodable {
    let evaluation: String
    let feedbackText: String
    let reasoning: String?
    let suggestNewNugget: Bool
    let tuneAcquired: Bool?
}

/// Local resume state is device-scoped, distinct from server-confirmed acquisition.
struct PracticeResume: Codable {
    var tuneKey: String
    var title: String
    var plan: [TunePracticeItem]
    var index: Int
    var updatedAt: Date
}
struct PracticeAttempt: Codable, Identifiable {
    var id = UUID()
    var tuneKey: String
    var date: Date
    var result: String
    var score: Int
}
