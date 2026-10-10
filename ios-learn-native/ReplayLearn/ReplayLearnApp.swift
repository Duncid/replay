import SwiftUI

@main
struct ReplayLearnApp: App {
    @StateObject private var viewModel = LessonViewModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(viewModel)
                .preferredColorScheme(.dark)
        }
    }
}
