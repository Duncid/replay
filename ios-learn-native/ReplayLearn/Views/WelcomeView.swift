import SwiftUI

/// Published tune library. Locked tunes remain visible but cannot be selected.
struct WelcomeView: View {
    @EnvironmentObject private var viewModel: LessonViewModel
    private let columns = [GridItem(.adaptive(minimum: 280), spacing: 16)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
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
                        Button { viewModel.startTune(tune.tuneKey) } label: {
                            HStack(spacing: 16) {
                                Image(systemName: tune.unlocked ? "music.note" : "lock.fill")
                                    .font(.title2)
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(tune.tuneKey).font(.headline)
                                    Text(tune.unlocked ? "Unlocked" : "Locked · Complete \(tune.prerequisites.joined(separator: ", "))")
                                        .font(.subheadline).foregroundStyle(.secondary)
                                }
                                Spacer(minLength: 0)
                                if tune.unlocked { Image(systemName: "arrow.right") }
                            }
                            .frame(maxWidth: .infinity, minHeight: 88, alignment: .leading)
                            .padding(20)
                            .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                        .disabled(!tune.unlocked)
                        .accessibilityLabel("\(tune.unlocked ? "Practice" : "Locked"): \(tune.tuneKey)")
                    }
                }
            }
            .padding(32)
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
            Circle()
                .fill(viewModel.midi.isConnected ? Color.green : Color.secondary)
                .frame(width: 8, height: 8)
            Text(viewModel.midi.isConnected
                 ? (viewModel.midi.sourceName ?? "MIDI connected")
                 : "No MIDI device — connect your piano's USB port")
                .font(.caption)
                .foregroundStyle(.secondary)
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
