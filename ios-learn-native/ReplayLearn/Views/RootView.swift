import SwiftUI

struct RootView: View {
    @EnvironmentObject private var viewModel: LessonViewModel

    var body: some View {
        ZStack {
            Color(.systemBackground).ignoresSafeArea()
            switch viewModel.phase {
            case .loadingLibrary, .loadingTune:
                ProgressView("Loading…")
                    .tint(.primary)
            case .library:
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
                        Task { await viewModel.loadLibrary() }
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
