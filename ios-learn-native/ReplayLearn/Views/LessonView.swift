import SwiftUI

/// Lesson screen: instruction, demo playback, practice recording, evaluation
/// and feedback — the whole practice loop.
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
            PianoKeyboardView(activePitch: viewModel.activePitch,
                              heldPitches: viewModel.heldPitches)
                .frame(height: 180)
            MidiStatusBar()
        }
    }

    private var header: some View {
        HStack {
            Button {
                viewModel.leaveLesson()
            } label: {
                Label("Leave", systemImage: "chevron.left")
            }
            .buttonStyle(.bordered)

            Spacer()

            if let brief = viewModel.lesson?.lessonBrief {
                VStack(spacing: 2) {
                    Text(brief.title).font(.headline)
                    if let track = brief.trackTitle {
                        Text(track).font(.caption).foregroundStyle(.secondary)
                    }
                }
            }

            Spacer()

            if viewModel.metronome.isPlaying {
                HStack(spacing: 6) {
                    Image(systemName: "metronome")
                    Text("\(Int(viewModel.lesson?.metronome?.bpm ?? viewModel.lesson?.setup.bpm ?? 0)) BPM")
                }
                .font(.caption)
                .foregroundStyle(.secondary)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 8)
        .background(.bar)
    }

    private var instructionCard: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let lesson = viewModel.lesson {
                Text(lesson.instruction)
                    .font(.body)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 12) {
                if viewModel.lesson?.demoSequence != nil {
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

            if viewModel.phase == .recording {
                Text("Recording — play the exercise on your piano, then tap Done.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
    }

    private var continueLabel: String {
        switch viewModel.evaluation?.nextAction {
        case .retrySame: return "Try Again"
        case .makeEasier, .makeHarder: return "Continue"
        case .exitToMainTeacher, .none: return "Back to Teacher"
        }
    }

    private func feedbackCard(_ evaluation: EvaluationOutput) -> some View {
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
            if let skills = evaluation.awardedSkills, !skills.isEmpty {
                Label("Skill unlocked: \(skills.joined(separator: ", "))",
                      systemImage: "star.fill")
                    .font(.subheadline)
                    .foregroundStyle(.yellow)
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.quaternary, in: RoundedRectangle(cornerRadius: 12))
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
