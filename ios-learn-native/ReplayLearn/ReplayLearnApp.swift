import SwiftUI

@main
struct ReplayLearnApp: App {
    @StateObject private var viewModel = LessonViewModel()

    var body: some Scene {
        WindowGroup {
            if ProcessInfo.processInfo.arguments.contains("--design-system") {
                DesignSystemView()
            } else {
                RootView()
                    .environmentObject(viewModel)
                    .preferredColorScheme(.dark)
            }
        }
    }
}
