import Foundation

/// Independent native client for the published tune library and tune practice.
actor APIClient {
    private let profileId: String
    private let auth: AuthSessionStore

    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()

    init(profileId: String, auth: AuthSessionStore = .shared) { self.profileId = profileId; self.auth = auth }

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
        request.httpBody = try encoder.encode(body)

        let (data, response) = try await auth.perform(request)
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
        let (data, response) = try await auth.perform(request)
        guard let http = response as? HTTPURLResponse else { throw APIError.invalidResponse }
        guard (200..<300).contains(http.statusCode) else { throw APIError.http(http.statusCode) }
        return try decoder.decode(Response.self, from: data)
    }

    private struct TunePosition: Decodable { let tune_key: String; let position: Double }
    private struct HiddenTune: Decodable { let tune_key: String }

    func fetchTuneLibrary() async throws -> [TuneLibraryItem] {
        async let tunes: [PublishedTune] = read("tune_assets", query: [
            URLQueryItem(name: "select", value: "tune_key,note_sequence,curriculum_versions!inner(status,published_at)"),
            URLQueryItem(name: "curriculum_versions.status", value: "eq.published"),
            URLQueryItem(name: "order", value: "curriculum_versions(published_at).asc")
        ])
        async let exports: [TuneCurriculumExport] = read("curriculum_exports", query: [
            URLQueryItem(name: "select", value: "snapshot,curriculum_versions!inner(status)"),
            URLQueryItem(name: "curriculum_versions.status", value: "eq.published"),
            URLQueryItem(name: "order", value: "created_at.desc"), URLQueryItem(name: "limit", value: "1")
        ])
        async let acquisitions: [TuneAcquisition] = read("user_tune_acquisition", query: [
            URLQueryItem(name: "select", value: "tune_key"),
            URLQueryItem(name: "local_user_id", value: "eq.\(profileId)")
        ])
        async let positions: [TunePosition] = read("tune_list_positions", query: [
            URLQueryItem(name: "select", value: "tune_key,position")
        ])
        async let hiddenRows: [HiddenTune] = read("hidden_system_tunes", query: [
            URLQueryItem(name: "select", value: "tune_key")
        ])
        let (allPublished, curriculum, progress) = try await (tunes, exports, acquisitions)
        // Noodlyn tunes this account removed stay hidden here too (shared with the web list).
        let hidden = Set((try? await hiddenRows)?.map { $0.tune_key } ?? [])
        let published = allPublished.filter { !hidden.contains($0.tune_key) }
        let saved = Dictionary((try? await positions)?.map { ($0.tune_key, $0.position) } ?? [], uniquingKeysWith: { a, _ in a })
        let acquired = Set(progress.map { $0.tune_key })
        // A tune keeps the place of its first publication and plays its newest version.
        var newest: [String: PublishedTune] = [:]
        var firstSeen: [String] = []
        for tune in published {
            if newest[tune.tune_key] == nil { firstSeen.append(tune.tune_key) }
            newest[tune.tune_key] = tune
        }
        // The account's saved order (shared with the web list) wins; unsaved tunes follow.
        let ordered = firstSeen.enumerated().sorted {
            let a = saved[$0.element] ?? .greatestFiniteMagnitude, b = saved[$1.element] ?? .greatestFiniteMagnitude
            return a != b ? a < b : $0.offset < $1.offset
        }.compactMap { newest[$0.element] }
        return ordered.map {
            var item = TuneAvailability.resolve($0.tune_key, snapshot: curriculum.first?.snapshot, acquired: acquired)
            item.sequence = $0.note_sequence
            return item
        }
    }

    struct TuneCoachBody: Encodable {
        let tuneKey: String
        let localUserId: String
        let language: String
        let debug = false
    }

    func startTune(tuneKey: String) async throws -> TuneCoachResponse {
        try await invoke("tune-coach", body: TuneCoachBody(tuneKey: tuneKey, localUserId: profileId, language: Config.language))
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
            userSequence: sequence, localUserId: profileId, language: Config.language))
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
