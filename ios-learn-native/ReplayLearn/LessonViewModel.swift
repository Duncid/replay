import Foundation
import SwiftUI

/// Drives the Learn flow: welcome → lesson (practice) → evaluation → feedback.
@MainActor
final class LessonViewModel: ObservableObject {
    enum Phase: Equatable {
        case loadingGreeting
        case welcome
        case startingLesson
        case practice
        case recording
        case evaluating
        case feedback
        case error(String)
    }

    @Published var phase: Phase = .loadingGreeting
    @Published var greeting: TeacherGreetingResponse?
    @Published var lesson: LessonStartResponse?
    @Published var evaluation: EvaluationOutput?
    @Published var activePitch: Int?
    @Published var heldPitches: Set<Int> = []

    let midi = MidiManager()
    let piano = PianoAudioEngine()
    let metronome = MetronomeEngine()

    private var demoTask: Task<Void, Never>?
    private var recordedNotes: [Note] = []
    private var openNotes: [Int: (start: Double, velocity: Int)] = [:]
    private var recordingStart: Double = 0

    init() {
        piano.preload()
        midi.onNoteOn = { [weak self] pitch, velocity in self?.handleNoteOn(pitch, velocity) }
        midi.onNoteOff = { [weak self] pitch in self?.handleNoteOff(pitch) }
        midi.start()
        Task { await loadGreeting() }
    }

    // MARK: - Welcome

    func loadGreeting() async {
        phase = .loadingGreeting
        do {
            greeting = try await APIClient.shared.fetchTeacherGreeting()
            phase = .welcome
        } catch {
            phase = .error(error.localizedDescription)
        }
    }

    // MARK: - Lesson lifecycle

    func startLesson(activityKey: String) {
        phase = .startingLesson
        Task {
            do {
                let response = try await APIClient.shared.startLesson(lessonKey: activityKey)
                lesson = response
                evaluation = nil
                phase = .practice
                startMetronomeIfNeeded()
            } catch {
                phase = .error(error.localizedDescription)
            }
        }
    }

    func playDemo() {
        guard let sequence = lesson?.demoSequence else { return }
        demoTask?.cancel()
        demoTask = piano.play(sequence: sequence) { [weak self] pitch in
            self?.activePitch = pitch
        }
    }

    // MARK: - Recording / evaluation

    func startRecording() {
        recordedNotes = []
        openNotes = [:]
        recordingStart = CACurrentMediaTime()
        phase = .recording
    }

    func stopAndEvaluate() {
        let now = CACurrentMediaTime() - recordingStart
        // Close any notes still held.
        for (pitch, open) in openNotes {
            recordedNotes.append(Note(pitch: pitch, startTime: open.start,
                                      endTime: now, velocity: open.velocity))
        }
        openNotes = [:]
        recordedNotes.sort { $0.startTime < $1.startTime }
        let sequence = NoteSequence(notes: recordedNotes,
                                    totalTime: max(now, recordedNotes.last?.endTime ?? 0))
        guard let lesson, !sequence.notes.isEmpty else {
            phase = .practice
            return
        }
        phase = .evaluating
        Task {
            do {
                let bpm = lesson.setup.bpm ?? lesson.metronome?.bpm ?? 90
                let meter = lesson.setup.meter ?? lesson.metronome?.timeSignature ?? "4/4"
                let result = try await APIClient.shared.evaluateLesson(
                    lessonRunId: lesson.lessonRunId, userSequence: sequence,
                    bpm: bpm, meter: meter)
                evaluation = result
                phase = .feedback
                if result.nextAction == .exitToMainTeacher {
                    metronome.stop()
                }
            } catch {
                phase = .error(error.localizedDescription)
            }
        }
    }

    /// Continue after feedback, following the coach's next action.
    func continueAfterFeedback() {
        guard let lesson, let result = evaluation else {
            phase = .welcome
            return
        }
        switch result.nextAction {
        case .exitToMainTeacher, .none:
            leaveLesson()
        case .retrySame:
            phase = .practice
        case .makeEasier, .makeHarder:
            phase = .startingLesson
            Task {
                do {
                    let response = try await APIClient.shared.regenerateLesson(
                        lessonKey: lesson.lessonBrief.lessonKey,
                        lessonRunId: lesson.lessonRunId,
                        setupOverrides: result.setupDelta)
                    self.lesson = response
                    self.evaluation = nil
                    phase = .practice
                } catch {
                    phase = .error(error.localizedDescription)
                }
            }
        }
    }

    func leaveLesson() {
        demoTask?.cancel()
        metronome.stop()
        lesson = nil
        evaluation = nil
        phase = .welcome
        Task { await loadGreeting() }
    }

    // MARK: - MIDI input

    private func handleNoteOn(_ pitch: Int, _ velocity: Int) {
        heldPitches.insert(pitch)
        activePitch = pitch
        piano.play(pitch: pitch, velocity: velocity)
        if phase == .recording {
            openNotes[pitch] = (CACurrentMediaTime() - recordingStart, velocity)
        }
    }

    private func handleNoteOff(_ pitch: Int) {
        heldPitches.remove(pitch)
        if activePitch == pitch { activePitch = nil }
        if phase == .recording, let open = openNotes.removeValue(forKey: pitch) {
            let end = CACurrentMediaTime() - recordingStart
            recordedNotes.append(Note(pitch: pitch, startTime: open.start,
                                      endTime: max(end, open.start + 0.05),
                                      velocity: open.velocity))
        }
    }

    // MARK: - Metronome

    private func startMetronomeIfNeeded() {
        guard let lesson else { return }
        let settings = lesson.metronome
        guard settings?.isActive == true, let bpm = settings?.bpm ?? lesson.setup.bpm else { return }
        metronome.start(bpm: bpm,
                        timeSignature: settings?.timeSignature ?? lesson.setup.meter ?? "4/4")
    }
}
