import SwiftUI

struct RootView: View {
    @EnvironmentObject private var viewModel: LessonViewModel
    @State private var showingDesignSystem = false

    var body: some View {
        ZStack {
            ReplayTheme.background.ignoresSafeArea()
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
                    .buttonStyle(ReplayButtonStyle())
                }
                .padding()
            }
        }
        .tint(ReplayTheme.accent)
        .safeAreaInset(edge: .top) {
            // Keep the catalog available even if the backend is offline.
            HStack {
                Text("Replay Nat").font(.caption).foregroundStyle(.secondary)
                Spacer()
                Button { showingDesignSystem = true } label: {
                    Label("Design system", systemImage: "paintpalette")
                }
                .buttonStyle(ReplayButtonStyle(kind: .secondary))
                .accessibilityIdentifier("open-design-system")
            }
            .padding(.horizontal, ReplayTheme.Space.medium)
            .padding(.vertical, ReplayTheme.Space.tiny)
        }
        .sheet(isPresented: $showingDesignSystem) { DesignSystemView() }
    }
}

#Preview {
    RootView().environmentObject(LessonViewModel())
}
