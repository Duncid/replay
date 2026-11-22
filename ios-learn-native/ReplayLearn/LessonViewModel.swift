import Foundation
import SwiftUI
import QuartzCore

/// Tune library → chosen tune → practice → evaluation. No teacher activity selection.
@MainActor
final class LessonViewModel: ObservableObject {
    enum Phase: Equatable {
        case loadingLibrary, library, loadingTune, practice, recording, evaluating, feedback
        case error(String)
    }

    @Published var phase: Phase = .loadingLibrary
    @Published private(set) var tunes: [TuneLibraryItem] = []
    @Published private(set) var tuneKey: String?
    @Published private(set) var practicePlan: [TunePracticeItem] = []
    @Published private(set) var currentIndex = 0
    @Published var evaluation: TuneEvaluationResponse?
    @Published var activePitch: Int?
    @Published var heldPitches: Set<Int> = []
    @Published private(set) var score = 0
    @Published private(set) var streak = 0

    let midi = MidiManager()
    let piano = PianoAudioEngine()
    let metronome = MetronomeEngine()
    let clock = HighwayClock()
    lazy var highway = NoteHighwayScene(clock: clock)
    private var judge = HitJudge()
    private var sweepTask: Task<Void, Never>?
    private var demoTask: Task<Void, Never>?
    private var requestTask: Task<Void, Never>?
    private var requestToken = UUID()
    private var recordedNotes: [Note] = []
    private var openNotes: [Int: (start: Double, velocity: Int)] = [:]
    private var recordingStart: Double = 0
    private let leadIn: Double = 60 / 90 * 4

    var currentItem: TunePracticeItem? {
        guard practicePlan.indices.contains(currentIndex) else { return nil }
        return practicePlan[currentIndex]
    }
    var targetSequence: NoteSequence? { currentItem?.sequence }

    init() {
        piano.preload()
        midi.onNoteOn = { [weak self] pitch, velocity in self?.handleNoteOn(pitch, velocity) }
        midi.onNoteOff = { [weak self] pitch in self?.handleNoteOff(pitch) }
        midi.start()
        Task { await loadLibrary() }
    }

    func loadLibrary() async {
        phase = .loadingLibrary
        let token = UUID(); requestToken = token
        do {
            let library = try await APIClient.shared.fetchTuneLibrary()
            guard requestToken == token else { return }
            tunes = library
            phase = .library
        } catch {
            guard requestToken == token else { return }
            phase = .error(error.localizedDescription)
        }
    }

    func startTune(_ key: String) {
        guard tunes.contains(where: { $0.tuneKey == key && $0.unlocked }) else { return }
        tuneKey = key
        fetchPracticePlan()
    }

    private func fetchPracticePlan() {
        guard let tuneKey else { return }
        requestTask?.cancel()
        phase = .loadingTune
        let token = UUID(); requestToken = token
        requestTask = Task {
            do {
                let response = try await APIClient.shared.startTune(tuneKey: tuneKey)
                guard !Task.isCancelled, requestToken == token else { return }
                guard !response.practicePlan.isEmpty,
                      response.practicePlan.allSatisfy({ $0.sequence?.notes.isEmpty == false }) else {
                    throw APIError.edge("No playable tune practice was returned.")
                }
                practicePlan = response.practicePlan
                currentIndex = 0
                evaluation = nil
                loadHighway()
                phase = .practice
            } catch {
                guard !Task.isCancelled, requestToken == token else { return }
                phase = .error(error.localizedDescription)
            }
        }
    }

    func playDemo() {
        guard phase == .practice || phase == .feedback, let sequence = targetSequence else { return }
        stopHighway()
        highway.setMode(.demo)
        let anchor = clock.start(leadIn: leadIn)
        demoTask = piano.play(sequence: sequence, startingAt: anchor) { [weak self] pitch in
            self?.activePitch = pitch
            self?.syncKeys()
        }
        sweepTask = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: UInt64((leadIn + sequence.totalTime + 0.5) * 1_000_000_000))
            guard !Task.isCancelled else { return }
            self?.clock.stop()
            self?.highway.setMode(.idle)
        }
    }

    private func loadHighway() {
        stopHighway()
        highway.bpm = 90
        highway.beatsPerBar = 4
        highway.load(sequence: targetSequence)
        highway.setMode(.idle)
        score = 0; streak = 0
    }

    private func stopHighway() {
        demoTask?.cancel(); demoTask = nil
        sweepTask?.cancel(); sweepTask = nil
        clock.stop()
        activePitch = nil
        syncKeys()
    }

    private func syncKeys() {
        var keys = heldPitches
        if let activePitch { keys.insert(activePitch) }
        highway.setHeld(keys)
    }

    func startRecording() {
        guard phase == .practice, let sequence = targetSequence else { return }
        stopHighway()
        recordedNotes = []; openNotes = [:]
        evaluation = nil
        phase = .recording
        highway.setMode(.play)
        recordingStart = clock.start(leadIn: leadIn)
        judge.reset(targets: sequence.notes)
        score = 0; streak = 0
        sweepTask = Task { @MainActor [weak self] in
            while !Task.isCancelled, let self, self.clock.isRunning {
                for result in self.judge.sweepMisses(now: self.clock.inputTime) {
                    self.highway.apply(result, streak: 0)
                }
                self.streak = self.judge.streak
                if self.clock.inputTime > sequence.totalTime + HitJudge.goodWindow {
                    self.stopAndEvaluate()
                    break
                }
                try? await Task.sleep(nanoseconds: 33_000_000)
            }
        }
    }

    func stopAndEvaluate() {
        guard phase == .recording, let tuneKey, let item = currentItem else { return }
        let now = max(0, CACurrentMediaTime() - recordingStart)
        stopHighway()
        highway.setMode(.idle)
        for (pitch, open) in openNotes {
            recordedNotes.append(Note(pitch: pitch, startTime: open.start,
                                      endTime: max(now, open.start + 0.05), velocity: Double(open.velocity)))
        }
        openNotes = [:]
        recordedNotes.sort { $0.startTime < $1.startTime }
        guard let first = recordedNotes.first else { phase = .practice; return }
        // Match the web attempt format: trim silence before the first played note.
        let notes = recordedNotes.map { Note(pitch: $0.pitch, startTime: $0.startTime - first.startTime,
                                            endTime: $0.endTime - first.startTime, velocity: $0.velocity) }
        let sequence = NoteSequence(notes: notes, totalTime: notes.map { $0.endTime }.max() ?? 0)
        phase = .evaluating
        let token = UUID(); requestToken = token
        requestTask = Task {
            do {
                let result = try await APIClient.shared.evaluateTune(tuneKey: tuneKey, itemId: item.itemId, sequence: sequence)
                guard !Task.isCancelled, requestToken == token else { return }
                evaluation = result
                phase = .feedback
            } catch {
                guard !Task.isCancelled, requestToken == token else { return }
                phase = .error(error.localizedDescription)
            }
        }
    }

    func continueAfterFeedback() {
        if evaluation?.tuneAcquired == true { leaveTune(); return }
        if evaluation?.suggestNewNugget == true { nextItem(); return }
        evaluation = nil
        loadHighway()
        phase = .practice
    }

    func nextItem() {
        guard phase == .practice || phase == .feedback else { return }
        if currentIndex + 1 >= practicePlan.count { fetchPracticePlan(); return }
        currentIndex += 1
        evaluation = nil
        loadHighway()
        phase = .practice
    }

    func previousItem() {
        guard (phase == .practice || phase == .feedback), currentIndex > 0 else { return }
        currentIndex -= 1
        evaluation = nil
        loadHighway()
        phase = .practice
    }

    func leaveTune() {
        requestToken = UUID()
        requestTask?.cancel()
        stopHighway()
        metronome.stop()
        openNotes = [:]; recordedNotes = []
        tuneKey = nil; practicePlan = []; evaluation = nil
        Task { await loadLibrary() }
    }

    private func handleNoteOn(_ pitch: Int, _ velocity: Int) {
        let alreadyHeld = heldPitches.contains(pitch)
        heldPitches.insert(pitch)
        activePitch = pitch
        piano.play(pitch: pitch, velocity: velocity)
        syncKeys()
        // A held key during count-in is ignored until released and pressed again.
        guard phase == .recording, clock.isRunning, clock.inputTime >= 0, !alreadyHeld else { return }
        let result = judge.noteOn(pitch: pitch, at: clock.inputTime)
        highway.apply(result, streak: judge.streak)
        score = judge.score; streak = judge.streak
        openNotes[pitch] = (clock.inputTime, velocity)
    }

    private func handleNoteOff(_ pitch: Int) {
        heldPitches.remove(pitch)
        if activePitch == pitch { activePitch = nil }
        syncKeys()
        if phase == .recording, let open = openNotes.removeValue(forKey: pitch) {
            let end = max(CACurrentMediaTime() - recordingStart, open.start + 0.05)
            recordedNotes.append(Note(pitch: pitch, startTime: open.start, endTime: end, velocity: Double(open.velocity)))
        }
    }
}
