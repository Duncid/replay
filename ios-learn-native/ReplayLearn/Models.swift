import Foundation

// MARK: - Note sequences (mirrors src/types/noteSequence.ts)

struct Note: Codable, Equatable {
    var pitch: Int
    var startTime: Double
    var endTime: Double
    var velocity: Int?
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
