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
                        ReplayFeedbackCard(evaluation: evaluation.evaluation, feedback: evaluation.feedbackText, reasoning: evaluation.reasoning, completed: evaluation.tuneAcquired == true)
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
            .buttonStyle(ReplayButtonStyle(kind: .secondary))

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
        ReplayCard {
        VStack(alignment: .leading, spacing: ReplayTheme.Space.medium) {
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
                    .buttonStyle(ReplayButtonStyle(kind: .secondary))
                    .disabled(viewModel.phase == .recording || viewModel.phase == .evaluating)
                }

                switch viewModel.phase {
                case .practice:
                    Button {
                        viewModel.startRecording()
                    } label: {
                        Label("Record My Attempt", systemImage: "record.circle")
                    }
                    .buttonStyle(ReplayButtonStyle())
                case .recording:
                    Button {
                        viewModel.stopAndEvaluate()
                    } label: {
                        Label("Done — Evaluate", systemImage: "stop.circle")
                    }
                    .buttonStyle(ReplayButtonStyle(kind: .destructive))
                case .evaluating:
                    ProgressView("Evaluating…")
                case .feedback:
                    Button {
                        viewModel.continueAfterFeedback()
                    } label: {
                        Label(continueLabel, systemImage: "arrow.right")
                    }
                    .buttonStyle(ReplayButtonStyle())
                default:
                    EmptyView()
                }
            }


        }
        }
    }

    private var continueLabel: String {
        if viewModel.evaluation?.tuneAcquired == true { return "Back to Tunes" }
        return viewModel.evaluation?.suggestNewNugget == true ? "Next Section" : "Try Again"
    }


}

#Preview {
    LessonView().environmentObject(LessonViewModel())
}
