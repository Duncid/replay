import AuthenticationServices
import Capacitor
import Security
import UIKit

/// Independent Capacitor authentication bridge. Session data never enters Safari storage.
@objc(ReplayAuthPlugin)
public final class ReplayAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "ReplayAuthPlugin"
    public let jsName = "ReplayAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveSession", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "removeSession", returnType: CAPPluginReturnPromise),
    ]
    private var authentication: ASWebAuthenticationSession?
    private var anchor: UIWindow?
    private func vaultQuery(_ call: CAPPluginCall) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "com.playbk.app.auth", kSecAttrAccount as String: call.getString("key") ?? "session"]
    }

    @objc func signIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.reject("Sign-in is unavailable."); return }
            guard self.authentication == nil else { call.reject("Sign-in is already open."); return }
            guard let origin = Bundle.main.object(forInfoDictionaryKey: "ReplayWebURL") as? String,
                  var url = URLComponents(string: origin), url.scheme == "https", url.host != nil else {
                call.reject("This build is missing the Replay website address."); return
            }
            let state = UUID().uuidString
            url.path = "/auth/native"; url.fragment = nil
            url.queryItems = [URLQueryItem(name: "client", value: "capacitor"), URLQueryItem(name: "state", value: state)]
            self.anchor = self.bridge?.viewController?.view.window
            guard let startURL = url.url, self.anchor != nil else { call.reject("Open Replay in the foreground and try again."); return }
            let session = ASWebAuthenticationSession(url: startURL, callbackURLScheme: "com.playbk.app") { [weak self] callback, error in
                DispatchQueue.main.async {
                    self?.authentication = nil; self?.anchor = nil
                    if let error { call.reject(error.localizedDescription); return }
                    guard let callback, callback.scheme == "com.playbk.app", callback.host == "auth", callback.path == "/callback",
                          let fragment = callback.fragment else { call.reject("Invalid sign-in response."); return }
                    let items = URLComponents(string: "https://callback.invalid/?" + fragment)?.queryItems ?? []
                    func value(_ key: String) -> String? {
                        let matches = items.filter { $0.name == key }
                        return matches.count == 1 ? matches.first?.value : nil
                    }
                    guard value("state") == state, let access = value("access_token"), !access.isEmpty,
                          let refresh = value("refresh_token"), !refresh.isEmpty else { call.reject("Invalid sign-in response."); return }
                    call.resolve(["accessToken": access, "refreshToken": refresh])
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = true
            self.authentication = session
            if !session.start() { self.authentication = nil; self.anchor = nil; call.reject("Couldn’t open sign-in. Please try again.") }
        }
    }
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { anchor! }

    @objc func getSession(_ call: CAPPluginCall) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--replay-performance") {
            call.resolve(["value": call.getString("key")?.hasSuffix("-auth-token") == true ? performanceSession() : NSNull()]); return
        }
        #endif
        var query = vaultQuery(call); query[kSecReturnData as String] = true
        var result: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { call.resolve(["value": NSNull()]); return }
        guard status == errSecSuccess, let data = result as? Data, let value = String(data: data, encoding: .utf8) else {
            call.reject("Couldn’t read your secure session. Unlock your iPad and try again."); return
        }
        call.resolve(["value": value])
    }
    @objc func saveSession(_ call: CAPPluginCall) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--replay-performance") { call.resolve(); return }
        #endif
        guard let value = call.getString("value"), let data = value.data(using: .utf8) else { call.reject("Invalid session."); return }
        let updates: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(vaultQuery(call) as CFDictionary, updates as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(vaultQuery(call).merging(updates) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { call.reject("Couldn’t save your secure session. Unlock your iPad and try again."); return }
        call.resolve()
    }
    @objc func removeSession(_ call: CAPPluginCall) {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--replay-performance") { call.resolve(); return }
        #endif
        let status = SecItemDelete(vaultQuery(call) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else { call.reject("Couldn’t remove your secure session."); return }
        call.resolve()
    }
    #if DEBUG
    private func performanceSession() -> String {
        let id = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
        let expires = Int(Date().timeIntervalSince1970) + 3600
        let payload = try! JSONSerialization.data(withJSONObject: ["sub": id, "exp": expires])
        let encoded = payload.base64EncodedString().replacingOccurrences(of: "=", with: "").replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_")
        let session: [String: Any] = ["access_token": "eyJhbGciOiJIUzI1NiJ9.\(encoded).fixture", "refresh_token": "performance-fixture",
            "expires_at": expires, "expires_in": 3600, "token_type": "bearer",
            "user": ["id": id, "email": "performance@example.invalid", "aud": "authenticated", "role": "authenticated", "app_metadata": [:], "user_metadata": [:]]]
        return String(data: try! JSONSerialization.data(withJSONObject: session), encoding: .utf8)!
    }
    #endif

}
