import SwiftUI
import AuthenticationServices

@MainActor
final class AccountModel: ObservableObject {
    @Published private(set) var user: AccountUser?
    @Published private(set) var profiles: [PracticeProfile] = []
    @Published private(set) var selectedProfile: PracticeProfile?
    @Published private(set) var busy = true
    @Published var error: String?
    private let browser = BrowserSignIn()
    private var operation = UUID()

    func restore() async {
        let operation = UUID(); self.operation = operation
        busy = true; error = nil
        do {
            let session = try await AuthSessionStore.shared.currentSession()
            let profiles = try await AuthSessionStore.shared.profiles()
            guard self.operation == operation else { return }
            user = session.user; self.profiles = profiles
            let saved = UserDefaults.standard.string(forKey: "replay.profile.\(session.user.id)")
            let legacy = UserDefaults.standard.string(forKey: "replay.localUserId")
            selectedProfile = profiles.first { $0.id.lowercased() == (saved ?? legacy)?.lowercased() } ?? profiles.first
        } catch AuthFailure.signedOut {
            guard self.operation == operation else { return }
            user = nil; profiles = []; selectedProfile = nil
        } catch {
            guard self.operation == operation else { return }
            self.error = error.localizedDescription
        }
        busy = false
    }
    func signIn() async {
        busy = true; error = nil
        do {
            let (access, refresh) = try await browser.signIn()
            try await AuthSessionStore.shared.install(accessToken: access, refreshToken: refresh)
            await restore()
        } catch {
            if (error as? ASWebAuthenticationSessionError)?.code != .canceledLogin { self.error = error.localizedDescription }
            busy = false
        }
    }
    func select(_ profile: PracticeProfile) {
        guard profiles.contains(profile), let user else { return }
        selectedProfile = profile
        UserDefaults.standard.set(profile.id, forKey: "replay.profile.\(user.id)")
    }
    func signOut() async {
        do {
            try await AuthSessionStore.shared.clear()
            operation = UUID(); user = nil; profiles = []; selectedProfile = nil; error = nil; busy = false
        } catch { self.error = error.localizedDescription }
    }
    func expired() { operation = UUID(); user = nil; profiles = []; selectedProfile = nil; busy = false; error = "Your session expired. Please sign in again." }
}

struct AccountGate: View {
    @StateObject private var account = AccountModel()
    var body: some View {
        Group {
            if let profile = account.selectedProfile, !account.busy {
                AccountPracticeView(profile: profile).id(profile.id).environmentObject(account)
            } else {
                VStack(spacing: 24) {
                    Text("Noodlyn Learn").font(ReplayTheme.display(40))
                    Text("Sign in to open your tunes and practice profiles.").foregroundStyle(ReplayTheme.muted)
                    if account.busy { ProgressView("Opening your account…") }
                    if let error = account.error { Text(error).foregroundStyle(ReplayTheme.muted).accessibilityLabel("Sign-in error: \(error)") }
                    Button("Sign in to Noodlyn") { Task { await account.signIn() } }.buttonStyle(ReplayButtonStyle()).disabled(account.busy)
                    Text("Use Google, Lovable, or email in the secure sign-in browser.").font(.footnote).foregroundStyle(ReplayTheme.muted)
                    if account.error != nil {
                        Button("Try restoring session again") { Task { await account.restore() } }.disabled(account.busy)
                    }
                    NavigationLink("Design system") { DesignSystemView() }
                }.padding(32).frame(maxWidth: .infinity, maxHeight: .infinity).background(ReplayTheme.background)
            }
        }
        .task { await account.restore() }
        .onReceive(NotificationCenter.default.publisher(for: AuthSessionStore.expired)) { _ in account.expired() }
        .preferredColorScheme(.dark).tint(ReplayTheme.accent)
    }
}

private struct AccountPracticeView: View {
    @StateObject private var model: LessonViewModel
    init(profile: PracticeProfile) { _model = StateObject(wrappedValue: LessonViewModel(profileId: profile.id)) }
    var body: some View { RootView().environmentObject(model).onDisappear { model.closeAccount() } }
}

struct AccountSettingsView: View {
    @EnvironmentObject private var account: AccountModel
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        Section("Account") {
            Text(account.user?.email ?? "Signed in")
            if let error = account.error { Text(error).foregroundStyle(.red) }
            ForEach(account.profiles) { profile in
                Button {
                    dismiss(); account.select(profile)
                } label: {
                    HStack { Text(profile.name); Spacer(); if profile == account.selectedProfile { Image(systemName: "checkmark") } }
                }
            }
            Button("Sign out", role: .destructive) { Task { await account.signOut() } }
        }
    }
}
