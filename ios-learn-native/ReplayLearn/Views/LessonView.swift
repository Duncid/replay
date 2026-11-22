import SwiftUI

/// Tune practice with pooled SpriteKit highway, MIDI recording, and coach feedback.
struct LessonView: View {
    @EnvironmentObject private var viewModel: LessonViewModel

    var body: some View {
        VStack(spacing: 0) {
            header
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    instructionCard
                    if viewModel.phase == .feedback, let evaluation = viewModel.evaluation {
                        feedbackCard(evaluation)
                    }
                }
                .padding(24)
            }
            ZStack(alignment: .topTrailing) {
                NoteHighwayView(scene: viewModel.highway)
                if viewModel.phase == .recording {
                    VStack(alignment: .trailing, spacing: 2) {
                        Text("\(viewModel.score)").font(.title2.monospacedDigit().bold())
                        if viewModel.streak > 1 {
                            Text("x\(viewModel.streak)").font(.caption.bold())
                        }
                    }
                    .padding(12)
                    .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 10))
                    .padding(12)
                }
            }
            .frame(height: 420)
            MidiStatusBar()
        }
    }

    private var header: some View {
        HStack {
            Button {
                viewModel.leaveTune()
            } label: {
                Label("Leave", systemImage: "chevron.left")
            }
            .buttonStyle(.bordered)

            Spacer()

            VStack(spacing: 2) {
                Text(viewModel.tuneKey ?? "Tune").font(.headline)
                Text("\(viewModel.currentIndex + 1) / \(viewModel.practicePlan.count)")
                    .font(.caption).foregroundStyle(.secondary)
            }

            Spacer()

            HStack {
                Button { viewModel.previousItem() } label: { Image(systemName: "backward.end.fill") }
                    .disabled(viewModel.currentIndex == 0 || viewModel.phase == .recording || viewModel.phase == .evaluating)
                    .accessibilityLabel("Previous section")
                Button { viewModel.nextItem() } label: { Image(systemName: "forward.end.fill") }
                    .disabled(viewModel.phase == .recording || viewModel.phase == .evaluating)
                    .accessibilityLabel("Next section")
            }

        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private var instructionCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let item = viewModel.currentItem {
                Text(item.instruction)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 12) {
                if viewModel.targetSequence != nil {
                    Button {
                        viewModel.playDemo()
                    } label: {
                        Label("Play Demo", systemImage: "play.fill")
                    }
                    .buttonStyle(.bordered)
                    .disabled(viewModel.phase == .recording || viewModel.phase == .evaluating)
                }

                switch viewModel.phase {
                case .practice:
                    Button {
                        viewModel.startRecording()
                    } label: {
                        Label("Record My Attempt", systemImage: "record.circle")
                    }
                    .buttonStyle(.borderedProminent)
                case .recording:
                    Button {
                        viewModel.stopAndEvaluate()
                    } label: {
                        Label("Done — Evaluate", systemImage: "stop.circle")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.red)
                case .evaluating:
                    ProgressView("Evaluating…")
                case .feedback:
                    Button {
                        viewModel.continueAfterFeedback()
                    } label: {
                        Label(continueLabel, systemImage: "arrow.right")
                    }
                    .buttonStyle(.borderedProminent)
                default:
                    EmptyView()
                }
            }


        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
    }

    private var continueLabel: String {
        if viewModel.evaluation?.tuneAcquired == true { return "Back to Tunes" }
        return viewModel.evaluation?.suggestNewNugget == true ? "Next Section" : "Try Again"
    }

    private func feedbackCard(_ evaluation: TuneEvaluationResponse) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: iconName(for: evaluation.evaluation))
                    .foregroundStyle(color(for: evaluation.evaluation))
                Text(evaluation.evaluation.capitalized)
                    .font(.headline)
            }
            Text(evaluation.feedbackText)
                .fixedSize(horizontal: false, vertical: true)
            if let reasoning = evaluation.reasoning, !reasoning.isEmpty {
                Text(reasoning)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if evaluation.tuneAcquired == true {
                Label("Tune completed", systemImage: "checkmark.seal.fill")
                    .font(.subheadline).foregroundStyle(.green)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 8))
    }

    private func iconName(for evaluation: String) -> String {
        switch evaluation {
        case "pass": return "checkmark.circle.fill"
        case "close": return "circle.lefthalf.filled"
        default: return "xmark.circle.fill"
        }
    }

    private func color(for evaluation: String) -> Color {
        switch evaluation {
        case "pass": return .green
        case "close": return .orange
        default: return .red
        }
    }
}

#Preview {
    LessonView().environmentObject(LessonViewModel())
}
