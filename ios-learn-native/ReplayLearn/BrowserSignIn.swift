import AuthenticationServices
import UIKit

/// The authentication sheet owns the callback; unrelated deep links cannot install sessions.
@MainActor
final class BrowserSignIn: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var authentication: ASWebAuthenticationSession?
    private var anchor: UIWindow?

    func signIn() async throws -> (String, String) {
        guard authentication == nil else { throw AuthFailure.message("Sign-in is already open.") }
        guard let origin = Bundle.main.object(forInfoDictionaryKey: "ReplayWebURL") as? String,
              var url = URLComponents(string: origin), url.scheme == "https", url.host != nil else {
            throw AuthFailure.message("This build is missing the Replay website address.")
        }
        let state = UUID().uuidString
        url.path = "/auth/native"; url.fragment = nil
        url.queryItems = [URLQueryItem(name: "client", value: "native"), URLQueryItem(name: "state", value: state)]
        anchor = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.flatMap(\.windows).first(where: \.isKeyWindow)
        guard anchor != nil, let startURL = url.url else { throw AuthFailure.message("Open Replay in the foreground and try again.") }
        return try await withCheckedThrowingContinuation { continuation in
            let session = ASWebAuthenticationSession(url: startURL, callbackURLScheme: "com.playbk.learn") { [weak self] callback, error in
                Task { @MainActor in
                    self?.authentication = nil; self?.anchor = nil
                    if let error { continuation.resume(throwing: error); return }
                    guard let callback, let tokens = Self.tokens(from: callback, state: state) else {
                        continuation.resume(throwing: AuthFailure.invalidCallback); return
                    }
                    continuation.resume(returning: tokens)
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            authentication = session
            if !session.start() {
                authentication = nil; anchor = nil
                continuation.resume(throwing: AuthFailure.message("Couldn’t open sign-in. Please try again."))
            }
        }
    }

    static func tokens(from callback: URL, state: String) -> (String, String)? {
        guard callback.scheme == "com.playbk.learn", callback.host == "auth", callback.path == "/callback",
              let fragment = callback.fragment else { return nil }
        let items = URLComponents(string: "https://callback.invalid/?" + fragment)?.queryItems ?? []
        func value(_ key: String) -> String? {
            let matches = items.filter { $0.name == key }
            return matches.count == 1 ? matches.first?.value : nil
        }
        guard value("state") == state, let access = value("access_token"), !access.isEmpty,
              let refresh = value("refresh_token"), !refresh.isEmpty else { return nil }
        return (access, refresh)
    }
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor! }
}
