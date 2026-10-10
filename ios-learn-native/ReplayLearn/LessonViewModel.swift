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

    // Note highway: drawing (scene), timing (clock) and scoring (judge) are separate.
    let clock = HighwayClock()
    lazy var highway = NoteHighwayScene(clock: clock)
    private var judge = HitJudge()
    private var sweepTask: Task<Void, Never>?
    @Published private(set) var score = 0
    @Published private(set) var streak = 0

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
                loadHighway()
                startMetronomeIfNeeded()
            } catch {
                phase = .error(error.localizedDescription)
            }
        }
    }

    func playDemo() {
        guard let sequence = lesson?.demoSequence else { return }
        demoTask?.cancel()
        stopHighway()
        highway.setMode(.demo)
        let anchor = clock.start(leadIn: leadIn)
        demoTask = piano.play(sequence: sequence, startingAt: anchor) { [weak self] pitch in
            self?.activePitch = pitch
            self?.syncKeys()
        }
        scheduleHighwayStop(after: leadIn + sequence.totalTime + 0.5)
    }

    // MARK: - Highway

    /// One bar of falling notes before t = 0.
    private var leadIn: Double {
        let bpm = lesson?.setup.bpm ?? lesson?.metronome?.bpm ?? 90
        let beats = Double((lesson?.setup.meter ?? "4/4").split(separator: "/").first.flatMap { Int($0) } ?? 4)
        return 60 / bpm * beats
    }

    private func loadHighway() {
        stopHighway()
        highway.bpm = lesson?.setup.bpm ?? lesson?.metronome?.bpm ?? 90
        highway.beatsPerBar = (lesson?.setup.meter ?? "4/4").split(separator: "/").first.flatMap { Int($0) } ?? 4
        highway.load(sequence: lesson?.demoSequence)
        highway.setMode(.idle)
    }

    private func stopHighway() {
        sweepTask?.cancel()
        sweepTask = nil
        clock.stop()
    }

    private func scheduleHighwayStop(after seconds: Double) {
        sweepTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.clock.stop()
            self?.highway.setMode(.idle)
        }
    }

    /// Play-along scoring loop: sweeps missed notes ~30x/s, independent of drawing.
    private func startScoring() {
        judge.reset(targets: lesson?.demoSequence?.notes ?? [])
        score = 0; streak = 0
        let end = leadIn + (lesson?.demoSequence?.totalTime ?? 0) + HitJudge.goodWindow
        sweepTask = Task { @MainActor [weak self] in
            while !Task.isCancelled, let self, self.clock.isRunning {
                for j in self.judge.sweepMisses(now: self.clock.inputTime) {
                    self.highway.apply(j, streak: 0)
                }
                self.streak = self.judge.streak
                if self.clock.inputTime > end - self.leadIn { break }
                try? await Task.sleep(nanoseconds: 33_000_000)
            }
        }
    }

    private func syncKeys() {
        var keys = heldPitches
        if let activePitch { keys.insert(activePitch) }
        highway.setHeld(keys)
    }

    // MARK: - Recording / evaluation

    func startRecording() {
        recordedNotes = []
        openNotes = [:]
        recordingStart = CACurrentMediaTime()
        phase = .recording
        demoTask?.cancel()
        stopHighway()
        if lesson?.demoSequence != nil {
            highway.setMode(.play)
            clock.start(leadIn: leadIn)
            startScoring()
        }
    }

    func stopAndEvaluate() {
        stopHighway()
        highway.setMode(.idle)
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
                    loadHighway()
                } catch {
                    phase = .error(error.localizedDescription)
                }
            }
        }
    }

    func leaveLesson() {
        demoTask?.cancel()
        stopHighway()
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
        syncKeys()
        if phase == .recording, clock.isRunning {
            let j = judge.noteOn(pitch: pitch, at: clock.inputTime)
            highway.apply(j, streak: judge.streak)
            score = judge.score
            streak = judge.streak
        }
        if phase == .recording {
            openNotes[pitch] = (CACurrentMediaTime() - recordingStart, velocity)
        }
    }

    private func handleNoteOff(_ pitch: Int) {
        heldPitches.remove(pitch)
        if activePitch == pitch { activePitch = nil }
        syncKeys()
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
