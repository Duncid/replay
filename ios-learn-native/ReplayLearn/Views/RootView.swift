import SwiftUI

struct RootView: View {
    @EnvironmentObject private var viewModel: LessonViewModel

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            switch viewModel.phase {
            case .loadingGreeting, .startingLesson:
                ProgressView("Loading…")
                    .tint(.primary)
            case .welcome:
                WelcomeView()
            case .practice, .recording, .evaluating, .feedback:
                LessonView()
            case .error(let message):
                VStack(spacing: 16) {
                    Image(systemName: "exclamationmark.triangle")
                        .font(.largeTitle)
                    Text(message)
                        .multilineTextAlignment(.center)
                    Button("Try Again") {
                        Task { await viewModel.loadGreeting() }
                    }
                    .buttonStyle(.borderedProminent)
                }
                .padding()
            }
        }
    }
}

#Preview {
    RootView().environmentObject(LessonViewModel())
}
