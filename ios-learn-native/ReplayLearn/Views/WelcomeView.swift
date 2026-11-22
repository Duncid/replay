import SwiftUI

/// Published tune library. Locked tunes remain visible but cannot be selected.
struct WelcomeView: View {
    @EnvironmentObject private var viewModel: LessonViewModel
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    private var columns: [GridItem] {
        [GridItem(dynamicTypeSize.isAccessibilitySize ? .flexible() : .adaptive(minimum: 280), spacing: ReplayTheme.Space.medium)]
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ReplayTheme.Space.large) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Tunes").font(.largeTitle.bold())
                    Spacer()
                    Text("\(viewModel.tunes.filter { $0.unlocked }.count) / \(viewModel.tunes.count) unlocked")
                        .foregroundStyle(.secondary)
                }
                if viewModel.tunes.isEmpty {
                    Text("No published tunes yet.").foregroundStyle(.secondary)
                }
                LazyVGrid(columns: columns, spacing: 16) {
                    ForEach(viewModel.tunes) { tune in
                        ReplayTuneCard(title: tune.tuneKey, unlocked: tune.unlocked, prerequisites: tune.prerequisites) {
                            viewModel.startTune(tune.tuneKey)
                        }
                    }
                }
            }
            .padding(ReplayTheme.Space.page)
            .frame(maxWidth: 1000, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .refreshable { await viewModel.loadLibrary() }
        .safeAreaInset(edge: .bottom) { MidiStatusBar() }
    }
}

struct MidiStatusBar: View {
    @EnvironmentObject private var viewModel: LessonViewModel

    var body: some View {
        HStack(spacing: 8) {
            ReplayStatus(
                title: viewModel.midi.isConnected
                    ? (viewModel.midi.sourceName ?? "MIDI connected")
                    : "No MIDI device — connect your piano's USB port",
                systemImage: viewModel.midi.isConnected ? "checkmark.circle.fill" : "cable.connector",
                color: viewModel.midi.isConnected ? ReplayTheme.success : .secondary,
                font: .caption
            )
            Spacer()
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
    }
}

#Preview {
    WelcomeView().environmentObject(LessonViewModel())
}
