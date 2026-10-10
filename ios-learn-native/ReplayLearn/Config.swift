import Foundation

/// Backend configuration. The publishable (anon) key is safe to ship in the app;
/// it only grants access allowed by row-level security, same as the web app.
enum Config {
    static let supabaseURL = URL(string: "https://mmlizntmpbriyumsunsh.supabase.co")!
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1tbGl6bnRtcGJyaXl1bXN1bnNoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQzMjU2MDYsImV4cCI6MjA3OTkwMTYwNn0.ur0_3T4wlZPrEmJxTto1CAqXChJY_uCHbP_wUH__rlA"

    /// Stable per-device user identifier used for progress tracking (localUserId).
    static var localUserId: String {
        let key = "replay.localUserId"
        if let existing = UserDefaults.standard.string(forKey: key) {
            return existing
        }
        let id = UUID().uuidString
        UserDefaults.standard.set(id, forKey: key)
        return id
    }

    /// Language passed to the teacher ("en" / "fr").
    static var language: String {
        Locale.current.language.languageCode?.identifier == "fr" ? "fr" : "en"
    }
}
