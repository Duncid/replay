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
    @Published var demoPitches: Set<Int> = []
    @Published var isDemoPlaying = false
    @Published var showKeyboard = true
    @Published var showHints = true
    @Published var tuneTitle = ""
    @Published var resume: PracticeResume?
    @Published var attempts: [PracticeAttempt] = []
    private var inputSources: [Int: Set<String>] = [:]
    private let defaults: UserDefaults
    private let preview: Bool
    private var lastHighwayAnnouncement: Double = -.infinity
    @Published var judgedPitches: Set<Int> = []
    @Published var armedPitches: Set<Int> = []
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
    private var demoPreparationTask: Task<Void, Never>?
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

    init(preview: Bool = false) {
        self.preview = preview
        defaults = preview ? UserDefaults(suiteName: "ReplayPreview")! : .standard
        if let data = defaults.data(forKey: "practice.resume") { resume = try? JSONDecoder().decode(PracticeResume.self, from: data) }
        if let data = defaults.data(forKey: "practice.attempts") { attempts = (try? JSONDecoder().decode([PracticeAttempt].self, from: data)) ?? [] }
        piano.preload()
        clock.renderTime = { [weak piano] in piano?.renderHostTime }
        highway.onSoundingChange = { [weak self] pitches in if self?.judgedPitches != pitches { self?.judgedPitches = pitches } }
        highway.onArmedChange = { [weak self] pitches in
            guard let self, self.armedPitches != pitches else { return }
            self.armedPitches = pitches
            if UIAccessibility.isVoiceOverRunning, !pitches.isEmpty, CACurrentMediaTime() - self.lastHighwayAnnouncement > 1 {
                self.lastHighwayAnnouncement = CACurrentMediaTime()
                UIAccessibility.post(notification: .announcement, argument: "Next: " + pitches.sorted().map(PianoGeometry.label).joined(separator: ", "))
            }
        }
        midi.onNoteOn = { [weak self] pitch, velocity in self?.noteDown(pitch, velocity, source: "midi") }
        midi.onNoteOff = { [weak self] pitch in self?.noteUp(pitch, source: "midi") }
        if !preview { Task { await loadLibrary() } }
        else { loadPreview() }
    }

    private func loadPreview() {
        #if DEBUG
        let sequence = NoteSequence(notes: [60,64,67,64,62,65,69,67,64,60].enumerated().map {
            Note(pitch: $0.element, startTime: Double($0.offset)*0.5, endTime: Double($0.offset)*0.5+0.4, velocity: 90)
        }, totalTime: 5)
        tunes = [TuneLibraryItem(tuneKey: "intro", unlocked: true, prerequisites: [], sequence: sequence),
                 TuneLibraryItem(tuneKey: "st-louis-blues", unlocked: false, prerequisites: ["intro"], sequence: sequence)]
        tuneTitle = "Intro"
        let item = TunePracticeItem(itemId: "preview", itemType: "nugget", instruction: "Listen to the phrase. Find your starting position, then record an attempt when you’re ready.", nugget: TunePlanSequence(noteSequence: sequence), assembly: nil, fullTune: nil)
        resume = PracticeResume(tuneKey: "intro", title: "Intro", plan: [item], index: 0, updatedAt: Date())
        phase = .library
        if ProcessInfo.processInfo.arguments.contains("--preview-practice") { startTune("intro") }
        #endif
    }
    func loadLibrary() async {
        if preview { phase = .library; return }
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
        if let resume, resume.tuneKey == key, !resume.plan.isEmpty {
            practicePlan = resume.plan; currentIndex = max(0, min(resume.index, resume.plan.count - 1))
            tuneTitle = resume.title; evaluation = nil; loadHighway(); phase = .practice
        } else { fetchPracticePlan() }
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
                tuneTitle = response.tuneTitle
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
        isDemoPlaying = true
        highway.setMode(.demo)
        demoPreparationTask = Task { @MainActor [weak self] in
            guard let self else { return }
            while !self.highway.isPresentationReady {
                do { try await Task.sleep(nanoseconds: 16_000_000) } catch { return }
            }
            guard !Task.isCancelled else { return }
            // One second of visible lead-in after the actual SpriteKit frame is ready.
            let anchor = self.clock.start(leadIn: 1)
            self.demoTask = self.piano.play(sequence: sequence, startingAt: anchor, onHeld: { [weak self] pitches in
                self?.demoPitches = pitches
            })
            self.sweepTask = Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: UInt64((1 + sequence.totalTime + 0.5) * 1_000_000_000))
                guard !Task.isCancelled else { return }
                self?.isDemoPlaying = false
                self?.demoPitches = []
                self?.clock.stop()
                self?.highway.setMode(.idle)
            }
        }
    }

    private func loadHighway() {
        saveResume()
        stopHighway()
        highway.bpm = 90
        highway.beatsPerBar = 4
        highway.load(sequence: targetSequence)
        highway.setMode(.idle)
        score = 0; streak = 0
    }

    private func stopHighway() {
        demoPreparationTask?.cancel(); demoPreparationTask = nil
        demoTask?.cancel(); demoTask = nil
        sweepTask?.cancel(); sweepTask = nil
        clock.stop()
        demoPitches = []; judgedPitches = []; isDemoPlaying = false
        piano.stopAll()
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
        if preview {
            evaluation = TuneEvaluationResponse(evaluation: "close", feedbackText: "Preview attempt captured. Live practice sends your performance to the coach.", reasoning: nil, suggestNewNugget: false, tuneAcquired: false)
            phase = .feedback; return
        }
        phase = .evaluating
        let token = UUID(); requestToken = token
        requestTask = Task {
            do {
                let result = try await APIClient.shared.evaluateTune(tuneKey: tuneKey, itemId: item.itemId, sequence: sequence)
                guard !Task.isCancelled, requestToken == token else { return }
                attempts.insert(PracticeAttempt(tuneKey: tuneKey, date: Date(), result: result.evaluation, score: score), at: 0)
                attempts = Array(attempts.prefix(200))
                if !preview { defaults.set(try? JSONEncoder().encode(attempts), forKey: "practice.attempts") }
                if result.tuneAcquired == true { resume = nil; defaults.removeObject(forKey: "practice.resume") }
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
        if evaluation?.suggestNewNugget == true {
            if currentIndex + 1 < practicePlan.count { nextItem() }
            else if !preview { fetchPracticePlan() }
            else { restart() }
            return
        }
        evaluation = nil
        loadHighway()
        phase = .practice
    }

    func nextItem() {
        guard phase == .practice || phase == .feedback else { return }
        guard currentIndex + 1 < practicePlan.count else { return }
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
        releaseInputs()
        openNotes = [:]; recordedNotes = []
        tuneKey = nil; practicePlan = []; evaluation = nil
        Task { await loadLibrary() }
    }

    func noteDown(_ pitch: Int, _ velocity: Int, source: String = "touch") {
        inputSources[pitch, default: []].insert(source)
        handleNoteOn(pitch, velocity)
    }
    func noteUp(_ pitch: Int, source: String = "touch") {
        inputSources[pitch]?.remove(source)
        guard inputSources[pitch]?.isEmpty != false else { return }
        inputSources.removeValue(forKey: pitch)
        handleNoteOff(pitch)
    }
    func releaseInputs() {
        for pitch in Array(heldPitches) { handleNoteOff(pitch) }
        inputSources = [:]
    }
    func suspend() {
        releaseInputs()
        if phase == .recording { phase = .practice; openNotes = [:]; recordedNotes = [] }
        stopHighway(); highway.setMode(.idle); metronome.stop()
    }
    func restart() {
        guard phase == .practice || phase == .feedback else { return }
        evaluation = nil; loadHighway(); phase = .practice
    }
    func stopDemo() { stopHighway(); highway.setMode(.idle) }
    private func saveResume() {
        guard let tuneKey, !practicePlan.isEmpty else { return }
        resume = PracticeResume(tuneKey: tuneKey, title: tuneTitle, plan: practicePlan, index: currentIndex, updatedAt: Date())
        if !preview { defaults.set(try? JSONEncoder().encode(resume), forKey: "practice.resume") }
    }
    private func handleNoteOn(_ pitch: Int, _ velocity: Int) {
        let alreadyHeld = heldPitches.contains(pitch)
        heldPitches.insert(pitch)
        piano.play(pitch: pitch, velocity: velocity)
        // A held key during count-in is ignored until released and pressed again.
        guard phase == .recording, clock.isRunning, clock.inputTime >= 0, !alreadyHeld else { return }
        let result = judge.noteOn(pitch: pitch, at: clock.inputTime)
        highway.apply(result, streak: judge.streak)
        score = judge.score; streak = judge.streak
        openNotes[pitch] = (clock.inputTime, velocity)
    }

    private func handleNoteOff(_ pitch: Int) {
        piano.release(pitch: pitch)
        heldPitches.remove(pitch)
        if phase == .recording, let open = openNotes.removeValue(forKey: pitch) {
            let end = max(CACurrentMediaTime() - recordingStart, open.start + 0.05)
            recordedNotes.append(Note(pitch: pitch, startTime: open.start, endTime: end, velocity: Double(open.velocity)))
        }
    }
}
