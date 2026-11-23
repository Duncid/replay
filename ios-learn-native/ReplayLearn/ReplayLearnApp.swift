import SwiftUI

@main
struct ReplayLearnApp: App {
    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.arguments.contains("--design-system") {
                DesignSystemView().preferredColorScheme(.dark)
            } else {
                ReplayMainView()
            }
        }
    }
}

/// Only the live experience owns a lesson model; the standalone design catalog
/// cannot initialize Cloud, MIDI or practice state as a side effect.
private struct ReplayMainView: View {
    @StateObject private var model = LessonViewModel(preview: {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains { $0.hasPrefix("--preview-") }
        #else
        return false
        #endif
    }())
    var body: some View { RootView().environmentObject(model).preferredColorScheme(.dark) }
}
