import Foundation

/// Thin client for the Lovable Cloud edge functions used by Learn mode.
/// Mirrors src/services/lessonService.ts.
actor APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init() {
        let config = URLSessionConfiguration.default
        // LLM-backed calls can take tens of seconds; no artificial short timeouts.
        config.timeoutIntervalForRequest = 300
        config.timeoutIntervalForResource = 600
        self.session = URLSession(configuration: config)
    }

    private func invoke<Response: Decodable, Body: Encodable>(
        _ function: String, body: Body
    ) async throws -> Response {
        let url = Config.supabaseURL
            .appendingPathComponent("functions/v1")
            .appendingPathComponent(function)
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(Config.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(Config.anonKey)", forHTTPHeaderField: "Authorization")
        request.httpBody = try encoder.encode(body)

        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }
        if http.statusCode >= 400 {
            if let payload = try? decoder.decode(EdgeErrorPayload.self, from: data) {
                throw APIError.edge(payload.error)
            }
            throw APIError.http(http.statusCode)
        }
        if let payload = try? decoder.decode(EdgeErrorPayload.self, from: data),
           data.count < 4096, payload.error.isEmpty == false,
           (try? decoder.decode(Response.self, from: data)) == nil {
            throw APIError.edge(payload.error)
        }
        return try decoder.decode(Response.self, from: data)
    }

    // MARK: - teacher-greet

    struct TeacherGreetBody: Encodable {
        let language: String
        let debug: Bool
        let localUserId: String
    }

    func fetchTeacherGreeting() async throws -> TeacherGreetingResponse {
        try await invoke("teacher-greet", body: TeacherGreetBody(
            language: Config.language, debug: false, localUserId: Config.localUserId))
    }

    // MARK: - lesson-start

    struct LessonStartBody: Encodable {
        let lessonKey: String
        let language: String
        let localUserId: String
        let debug: Bool
        let difficulty: Int?
        let lessonRunId: String?
        let regenerate: Bool?
        let setupOverrides: LessonRunSetup?
    }

    func startLesson(lessonKey: String, difficulty: Int? = nil) async throws -> LessonStartResponse {
        try await invoke("lesson-start", body: LessonStartBody(
            lessonKey: lessonKey, language: Config.language, localUserId: Config.localUserId,
            debug: false, difficulty: difficulty, lessonRunId: nil, regenerate: nil,
            setupOverrides: nil))
    }

    func regenerateLesson(lessonKey: String, lessonRunId: String,
                          setupOverrides: LessonRunSetup? = nil,
                          difficulty: Int? = nil) async throws -> LessonStartResponse {
        try await invoke("lesson-start", body: LessonStartBody(
            lessonKey: lessonKey, language: Config.language, localUserId: Config.localUserId,
            debug: false, difficulty: difficulty, lessonRunId: lessonRunId, regenerate: true,
            setupOverrides: setupOverrides))
    }

    // MARK: - lesson-evaluate

    struct LessonEvaluateBody: Encodable {
        let lessonRunId: String
        let userSequence: NoteSequence
        let metronomeContext: MetronomeContext
        let localUserId: String
        let debug: Bool
    }

    func evaluateLesson(lessonRunId: String, userSequence: NoteSequence,
                        bpm: Double, meter: String) async throws -> EvaluationOutput {
        try await invoke("lesson-evaluate", body: LessonEvaluateBody(
            lessonRunId: lessonRunId, userSequence: userSequence,
            metronomeContext: MetronomeContext(bpm: bpm, meter: meter),
            localUserId: Config.localUserId, debug: false))
    }
}

enum APIError: LocalizedError {
    case invalidResponse
    case http(Int)
    case edge(String)

    var errorDescription: String? {
        switch self {
        case .invalidResponse: return "Invalid response from server."
        case .http(let code): return "Server error (HTTP \(code))."
        case .edge(let message): return message
        }
    }
}
