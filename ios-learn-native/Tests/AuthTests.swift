import Foundation

private final class MemorySession: SessionPersistence {
    var value: AccountSession?
    func load() -> AccountSession? { value }
    func save(_ value: AccountSession) { self.value = value }
    func remove() { value = nil }
}
private final class MockAuthHTTP: URLProtocol {
    static var handler: ((URLRequest) throws -> (Int, Data))!
    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        do {
            let (status, data) = try Self.handler(request)
            client?.urlProtocol(self, didReceive: HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
            client?.urlProtocol(self, didLoad: data); client?.urlProtocolDidFinishLoading(self)
        } catch { client?.urlProtocol(self, didFailWithError: error) }
    }
    override func stopLoading() {}
}

@main
struct AuthTests {
    static func main() async throws {
        let user = AccountUser(id: "account-a", email: "a@example.test")
        let config = URLSessionConfiguration.ephemeral; config.protocolClasses = [MockAuthHTTP.self]
        let transport = URLSession(configuration: config)
        let vault = MemorySession()
        let auth = AuthSessionStore(transport: transport, persistence: vault)
        var refreshes = 0
        var authenticatedReads = 0
        MockAuthHTTP.handler = { request in
            let path = request.url!.path
            if path.hasSuffix("/user") {
                precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer login-token")
                return (200, try JSONEncoder().encode(user))
            }
            if path.hasSuffix("/token") {
                refreshes += 1; Thread.sleep(forTimeInterval: 0.05)
                return (200, Data(#"{"access_token":"refreshed","refresh_token":"rotated","expires_in":3600,"user":{"id":"account-a","email":"a@example.test"}}"#.utf8))
            }
            precondition(request.value(forHTTPHeaderField: "Authorization") == "Bearer refreshed")
            precondition(request.value(forHTTPHeaderField: "apikey") == Config.anonKey)
            authenticatedReads += 1
            if path.hasSuffix("user_tune_acquisition") { precondition(request.url!.query!.contains("local_user_id=eq.profile-a")) }
            return (200, Data("[]".utf8))
        }
        try await auth.install(accessToken: "login-token", refreshToken: "first-refresh")
        let api = APIClient(profileId: "profile-a", auth: auth)
        _ = try await api.fetchTuneLibrary()
        // Tunes, curriculum, acquisitions and account-owned list positions.
        precondition(refreshes == 1 && authenticatedReads == 4, "Concurrent library reads must share one refresh")
        precondition(vault.value?.refreshToken == "rotated")
        let restored = AuthSessionStore(transport: transport, persistence: vault)
        _ = try await restored.currentSession()
        precondition(refreshes == 1, "Restoring an unexpired session must not refresh")
        try await restored.clear()
        precondition(vault.value == nil)
        do { _ = try await restored.currentSession(); fatalError("Signed-out session was restored") } catch AuthFailure.signedOut {}

        vault.value = AccountSession(accessToken: "old", refreshToken: "expired", expiresAt: .distantPast, user: user)
        let expired = AuthSessionStore(transport: transport, persistence: vault)
        MockAuthHTTP.handler = { _ in (400, Data()) }
        do { _ = try await expired.currentSession(); fatalError("Expired refresh accepted") } catch AuthFailure.signedOut {}
        precondition(vault.value == nil)

        vault.value = AccountSession(accessToken: "old", refreshToken: "offline", expiresAt: .distantPast, user: user)
        let offline = AuthSessionStore(transport: transport, persistence: vault)
        MockAuthHTTP.handler = { _ in throw URLError(.notConnectedToInternet) }
        do { _ = try await offline.currentSession(); fatalError("Offline refresh succeeded") } catch is URLError {}
        precondition(vault.value?.refreshToken == "offline", "Temporary network failure must retain sign-in")

        let race = AuthSessionStore(transport: transport, persistence: vault)
        MockAuthHTTP.handler = { _ in
            Thread.sleep(forTimeInterval: 0.15)
            return (200, Data(#"{"access_token":"late","refresh_token":"late","expires_in":3600,"user":{"id":"account-a"}}"#.utf8))
        }
        let refresh = Task { try await race.currentSession() }
        try await Task.sleep(nanoseconds: 30_000_000)
        try await race.clear()
        do { _ = try await refresh.value; fatalError("Late refresh restored signed-out session") } catch {}
        precondition(vault.value == nil)
        print("PASS: authenticated profile reads, single refresh, persistence, expired session, offline recovery, sign-out race")
    }
}
