import Foundation
import Security

struct AccountUser: Codable, Equatable {
    let id: String
    let email: String?
}
struct PracticeProfile: Decodable, Identifiable, Equatable {
    let id: String
    let name: String
}
struct AccountSession: Codable {
    let accessToken: String
    let refreshToken: String
    let expiresAt: Date
    let user: AccountUser
}

enum AuthFailure: LocalizedError {
    case signedOut, invalidCallback, keychain(Int32), message(String)
    var errorDescription: String? {
        switch self {
        case .signedOut: return "Your session expired. Please sign in again."
        case .invalidCallback: return "The sign-in response was invalid. Please try again."
        case .keychain: return "Couldn’t save your sign-in securely. Please unlock your iPad and try again."
        case .message(let message): return message
        }
    }
}

protocol SessionPersistence {
    func load() throws -> AccountSession?
    func save(_ value: AccountSession) throws
    func remove() throws
}

private struct KeychainSessionPersistence: SessionPersistence {
    private var query: [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.playbk.learn.auth", kSecAttrAccount as String: "session"]
    }
    func load() throws -> AccountSession? {
        var request = query; request[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess, let data = result as? Data else { throw AuthFailure.keychain(status) }
        return try JSONDecoder().decode(AccountSession.self, from: data)
    }
    func save(_ value: AccountSession) throws {
        let updates: [String: Any] = [kSecValueData as String: try JSONEncoder().encode(value), kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, updates as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(updates) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw AuthFailure.keychain(status) }
    }
    func remove() throws {
        let status = SecItemDelete(query as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { throw AuthFailure.keychain(status) }
    }
}

/// Refresh is shared by concurrent library requests; stale responses cannot restore a signed-out account.
actor AuthSessionStore {
    static let shared = AuthSessionStore()
    static let expired = Notification.Name("ReplayAuthExpired")
    private var session: AccountSession?
    private var loaded = false
    private var generation = UUID()
    private var refreshTask: Task<AccountSession, Error>?
    private let transport: URLSession
    private let persistence: SessionPersistence

    init(transport: URLSession? = nil, persistence: SessionPersistence? = nil) {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 300
        config.timeoutIntervalForResource = 600
        self.transport = transport ?? URLSession(configuration: config)
        self.persistence = persistence ?? KeychainSessionPersistence()
    }
    private func load() throws {
        guard !loaded else { return }
        session = try persistence.load(); loaded = true
    }
    private func save(_ value: AccountSession) throws {
        try persistence.save(value)
        session = value; loaded = true
    }
    func clear() throws {
        try persistence.remove()
        generation = UUID(); refreshTask?.cancel(); refreshTask = nil
        session = nil; loaded = true
    }

    func install(accessToken: String, refreshToken: String) async throws {
        let version = generation
        var request = URLRequest(url: Config.supabaseURL.appendingPathComponent("auth/v1/user"))
        request.setValue(Config.anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        let (data, response) = try await transport.data(for: request)
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw AuthFailure.invalidCallback }
        let user = try JSONDecoder().decode(AccountUser.self, from: data)
        guard generation == version else { throw AuthFailure.signedOut }
        generation = UUID(); refreshTask?.cancel(); refreshTask = nil
        // Refresh on first use instead of trusting unvalidated JWT expiration claims.
        try save(AccountSession(accessToken: accessToken, refreshToken: refreshToken, expiresAt: .distantPast, user: user))
    }

    func currentSession(forceRefresh: Bool = false) async throws -> AccountSession {
        try load()
        guard let current = session else { throw AuthFailure.signedOut }
        if !forceRefresh && current.expiresAt.timeIntervalSinceNow > 60 { return current }
        if let refreshTask {
            let version = generation
            let result = try await refreshTask.value
            guard generation == version else { throw AuthFailure.signedOut }
            return result
        }
        let version = generation
        let task = Task<AccountSession, Error> {
            struct RefreshResponse: Decodable {
                let access_token: String
                let refresh_token: String
                let expires_in: Double
                let user: AccountUser
            }
            var request = URLRequest(url: Config.supabaseURL.appendingPathComponent("auth/v1/token"))
            request.url = URL(string: request.url!.absoluteString + "?grant_type=refresh_token")
            request.httpMethod = "POST"
            request.setValue(Config.anonKey, forHTTPHeaderField: "apikey")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": current.refreshToken])
            let (data, response) = try await transport.data(for: request)
            let code = (response as? HTTPURLResponse)?.statusCode ?? 0
            if code == 400 || code == 401 { throw AuthFailure.signedOut }
            guard (200..<300).contains(code) else { throw APIError.http(code) }
            let result = try JSONDecoder().decode(RefreshResponse.self, from: data)
            guard result.user.id == current.user.id else { throw AuthFailure.invalidCallback }
            return AccountSession(accessToken: result.access_token, refreshToken: result.refresh_token,
                                  expiresAt: Date().addingTimeInterval(result.expires_in), user: result.user)
        }
        refreshTask = task
        do {
            let result = try await task.value
            guard generation == version else { throw AuthFailure.signedOut }
            try save(result); refreshTask = nil
            return result
        } catch {
            if generation == version {
                refreshTask = nil
                if case AuthFailure.signedOut = error {
                    try clear()
                    await MainActor.run { NotificationCenter.default.post(name: Self.expired, object: nil) }
                }
            }
            throw error
        }
    }

    func perform(_ original: URLRequest) async throws -> (Data, URLResponse) {
        let version = generation
        let credential = try await currentSession()
        guard version == generation else { throw AuthFailure.signedOut }
        func authorized(_ token: String) -> URLRequest {
            var request = original
            request.setValue(Config.anonKey, forHTTPHeaderField: "apikey")
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
            return request
        }
        var result = try await transport.data(for: authorized(credential.accessToken))
        guard version == generation else { throw AuthFailure.signedOut }
        if (result.1 as? HTTPURLResponse)?.statusCode == 401 {
            // Another request may already have refreshed while this one was in flight.
            let refreshed = try await currentSession(forceRefresh: session?.accessToken == credential.accessToken)
            guard version == generation else { throw AuthFailure.signedOut }
            result = try await transport.data(for: authorized(refreshed.accessToken))
        }
        guard version == generation else { throw AuthFailure.signedOut }
        return result
    }

    func profiles() async throws -> [PracticeProfile] {
        let user = try await currentSession().user
        var components = URLComponents(url: Config.supabaseURL.appendingPathComponent("rest/v1/local_users"), resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "select", value: "id,name"), URLQueryItem(name: "auth_user_id", value: "eq.\(user.id)"), URLQueryItem(name: "order", value: "created_at.asc")]
        let (data, response) = try await perform(URLRequest(url: components.url!))
        guard (response as? HTTPURLResponse)?.statusCode == 200 else { throw AuthFailure.message("Couldn’t load your practice profiles. Please try again.") }
        let profiles = try JSONDecoder().decode([PracticeProfile].self, from: data)
        guard profiles.isEmpty else { return profiles }
        var create = URLRequest(url: Config.supabaseURL.appendingPathComponent("rest/v1/local_users"))
        create.httpMethod = "POST"
        create.setValue("application/json", forHTTPHeaderField: "Content-Type")
        create.setValue("return=representation", forHTTPHeaderField: "Prefer")
        create.httpBody = try JSONSerialization.data(withJSONObject: ["name": "Player", "auth_user_id": user.id])
        let (created, createdResponse) = try await perform(create)
        guard (createdResponse as? HTTPURLResponse)?.statusCode == 201 else { throw AuthFailure.message("Couldn’t create your practice profile. Please try again.") }
        return try JSONDecoder().decode([PracticeProfile].self, from: created)
    }
}
