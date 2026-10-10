import SwiftUI

/// Teacher welcome screen: greeting + suggested lessons.
struct WelcomeView: View {
    @EnvironmentObject private var viewModel: LessonViewModel

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let greeting = viewModel.greeting {
                    Text(greeting.greeting)
                        .font(.title2)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(alignment: .leading, spacing: 12) {
                        Text("Suggested for you")
                            .font(.headline)
                            .foregroundStyle(.secondary)
                        ForEach(greeting.suggestions) { suggestion in
                            Button {
                                viewModel.startLesson(activityKey: suggestion.activityKey)
                            } label: {
                                SuggestionRow(suggestion: suggestion)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(32)
            .frame(maxWidth: 700, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom) {
            MidiStatusBar()
        }
    }
}

private struct SuggestionRow: View {
    let suggestion: TeacherSuggestion

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(suggestion.label)
                    .font(.headline)
                Text(suggestion.why)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                HStack(spacing: 8) {
                    Text(suggestion.trackTitle)
                    if let level = suggestion.level {
                        Text("· \(level.capitalized)")
                    }
                }
                .font(.caption)
                .foregroundStyle(.tertiary)
            }
            Spacer()
            Image(systemName: "chevron.right")
                .foregroundStyle(.tertiary)
        }
        .padding()
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
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
