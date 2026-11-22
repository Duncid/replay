import Foundation

/// Independent native client for the published tune library and tune practice.
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

    // MARK: - Published tunes (no teacher selection)

    private func read<Response: Decodable>(_ table: String, query: [URLQueryItem]) async throws -> Response {
        var components = URLComponents(url: Config.supabaseURL.appendingPathComponent("rest/v1/\(table)"), resolvingAgainstBaseURL: false)
        components?.queryItems = query
        guard let url = components?.url else { throw APIError.invalidResponse }
        var request = URLRequest(url: url)
        request.setValue(Config.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(Config.anonKey)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode) }
        return try decoder.decode(Response.self, from: data)
    }

    /// Register the stable device identity before writing progress with a foreign key.
    private func ensureLocalUser() async throws {
        struct LocalUser: Decodable { let id: String }
        let users: [LocalUser] = try await read("local_users", query: [
            URLQueryItem(name: "select", value: "id"),
            URLQueryItem(name: "id", value: "eq.\(Config.localUserId)")
        ])
        guard users.isEmpty else { return }
        var request = URLRequest(url: Config.supabaseURL.appendingPathComponent("rest/v1/local_users"))
        request.httpMethod = "POST"
        request.setValue(Config.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(Config.anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["id": Config.localUserId, "name": "iPad"])
        let (_, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode) }
    }

    func fetchTuneLibrary() async throws -> [TuneLibraryItem] {
        try await ensureLocalUser()
        async let tunes: [PublishedTune] = read("tune_assets", query: [
            URLQueryItem(name: "select", value: "tune_key,curriculum_versions!inner(status,published_at)"),
            URLQueryItem(name: "curriculum_versions.status", value: "eq.published"),
            URLQueryItem(name: "order", value: "curriculum_versions(published_at).desc")
        ])
        async let exports: [TuneCurriculumExport] = read("curriculum_exports", query: [
            URLQueryItem(name: "select", value: "snapshot,curriculum_versions!inner(status)"),
            URLQueryItem(name: "curriculum_versions.status", value: "eq.published"),
            URLQueryItem(name: "order", value: "created_at.desc"), URLQueryItem(name: "limit", value: "1")
        ])
        async let acquisitions: [TuneAcquisition] = read("user_tune_acquisition", query: [
            URLQueryItem(name: "select", value: "tune_key"),
            URLQueryItem(name: "local_user_id", value: "eq.\(Config.localUserId)")
        ])
        let (published, curriculum, progress) = try await (tunes, exports, acquisitions)
        var seen = Set<String>()
        let acquired = Set(progress.map { $0.tune_key })
        return published.filter { seen.insert($0.tune_key).inserted }.map {
            TuneAvailability.resolve($0.tune_key, snapshot: curriculum.first?.snapshot, acquired: acquired)
        }
    }

    struct TuneCoachBody: Encodable {
        let tuneKey: String
        let localUserId: String
        let language: String
        let debug = false
    }

    func startTune(tuneKey: String) async throws -> TuneCoachResponse {
        try await invoke("tune-coach", body: TuneCoachBody(tuneKey: tuneKey, localUserId: Config.localUserId, language: Config.language))
    }

    struct TuneEvaluateBody: Encodable {
        let tuneKey: String
        let nuggetId: String
        let userSequence: NoteSequence
        let localUserId: String
        let language: String
        let debug = false
    }

    func evaluateTune(tuneKey: String, itemId: String, sequence: NoteSequence) async throws -> TuneEvaluationResponse {
        try await invoke("tune-evaluate", body: TuneEvaluateBody(tuneKey: tuneKey, nuggetId: itemId,
            userSequence: sequence, localUserId: Config.localUserId, language: Config.language))
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
