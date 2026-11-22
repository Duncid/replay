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

// MARK: - Lesson setup / metronome (mirrors src/types/learningSession.ts)

struct LessonRunSetup: Codable, Equatable {
    var bpm: Double?
    var meter: String?
    var feel: String?
    var bars: Int?
    var countInBars: Int?
    var difficulty: Int?
}

struct LessonMetronomeSettings: Codable, Equatable {
    var bpm: Double?
    var timeSignature: String?
    var isActive: Bool?
    var feel: String?
    var soundType: String?
    var accentPreset: String?
}

struct LessonBrief: Codable, Equatable {
    var lessonKey: String
    var title: String
    var goal: String
    var level: String?
    var requiredSkills: [String]?
    var awardedSkills: [String]?
    var nextLessonKey: String?
    var trackKey: String?
    var trackTitle: String?
}

struct LessonStartResponse: Codable, Equatable {
    var lessonRunId: String
    var instruction: String
    var demoSequence: NoteSequence?
    var setup: LessonRunSetup
    var metronome: LessonMetronomeSettings?
    var lessonBrief: LessonBrief
    var difficulty: Int?
}

// MARK: - Evaluation

enum CoachNextAction: String, Codable {
    case retrySame = "RETRY_SAME"
    case makeEasier = "MAKE_EASIER"
    case makeHarder = "MAKE_HARDER"
    case exitToMainTeacher = "EXIT_TO_MAIN_TEACHER"
}

struct EvaluationOutput: Codable, Equatable {
    var evaluation: String // "pass" | "close" | "fail"
    var diagnosis: [String]?
    var feedbackText: String
    var nextAction: CoachNextAction?
    var setupDelta: LessonRunSetup?
    var awardedSkills: [String]?
    var exitHint: String?
    var markLessonAcquired: Bool?
    var reasoning: String?
}

struct MetronomeContext: Codable {
    var bpm: Double
    var meter: String
}

// MARK: - Teacher greeting

struct TeacherSuggestion: Codable, Equatable, Identifiable {
    var activityKey: String
    var activityType: String // "lesson" | "tune"
    var label: String
    var why: String
    var trackTitle: String
    var level: String?
    var musicRef: String?

    var id: String { activityKey }
}

struct TeacherGreetingResponse: Codable, Equatable {
    var greeting: String
    var suggestions: [TeacherSuggestion]
    var notes: String?
}

// MARK: - Generic error payload from edge functions

struct EdgeErrorPayload: Codable {
    var error: String
}

// MARK: - Published tune library and progression

struct PublishedTune: Decodable, Identifiable {
    let tune_key: String
    var id: String { tune_key }
}

struct TuneLibraryItem: Identifiable {
    let tuneKey: String
    let unlocked: Bool
    let prerequisites: [String]
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
            return TuneLibraryItem(tuneKey: musicRef, unlocked: true, prerequisites: [])
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

struct TunePlanSequence: Decodable {
    let noteSequence: NoteSequence?
}

struct TunePracticeItem: Decodable, Identifiable {
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
