import SwiftUI

struct LessonView: View {
    @EnvironmentObject private var model: LessonViewModel
    @State private var fullKeyboard: Bool = {
        #if DEBUG
        return ProcessInfo.processInfo.arguments.contains("--replay-performance") && ProcessInfo.processInfo.arguments.contains("--performance-full")
        #else
        return false
        #endif
    }()
    private var busy: Bool { model.phase == .recording || model.phase == .evaluating }
    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                ViewThatFits(in: .horizontal) {
                    HStack(alignment: .top, spacing: 12) {
                        transport
                        if model.showHints { coach.frame(width: 320, height: 150) }
                    }
                    VStack(spacing: 8) {
                        transport
                        if model.showHints { coach.frame(height: 130) }
                    }
                }.padding(.vertical, 8)
                KeyboardDock(full: fullKeyboard, includeHighway: true, toolbar: AnyView(pianoToolbar))
                    .frame(maxHeight: .infinity)

            }
        }
        .background(ReplayTheme.background).ignoresSafeArea(edges: .bottom)
        .navigationTitle(model.tuneTitle)
        .toolbar {
            ToolbarItem(placement: .topBarLeading) {
                Button("Tunes", systemImage: "chevron.left", action: model.leaveTune)
            }
            ToolbarItem(placement: .principal) {
                VStack(spacing: 3) {
                    Text(model.tuneTitle).font(.headline)
                    Text("SECTION \(model.currentIndex+1)/\(model.practicePlan.count) · 90 BPM").font(ReplayTheme.mono(10)).foregroundStyle(ReplayTheme.muted)
                }
            }

        }
    }
    private var pianoToolbar: some View {
        ViewThatFits(in: .horizontal) {
            pianoToolbarControls.labelStyle(.titleAndIcon)
            pianoToolbarControls.labelStyle(.iconOnly)
        }.buttonStyle(.borderless).controlSize(.large).tint(ReplayTheme.ink)
            .padding(.horizontal, 12).frame(minHeight: 52)
            .overlay(alignment: .top) { Rectangle().fill(ReplayTheme.border).frame(height: 1) }
    }
    private var pianoToolbarControls: some View {
        HStack(spacing: 16) {
            Text("PIANO").font(ReplayTheme.mono(11)).foregroundStyle(ReplayTheme.muted)
            MetronomeControl(engine: model.metronome).fixedSize()
            Spacer(minLength: 0)
            MIDIControl().fixedSize()
            Menu {
                Toggle("Show keyboard", isOn: $model.showKeyboard)
                Toggle("Full 88-key range", isOn: $fullKeyboard)
                Toggle("Show coach", isOn: $model.showHints)
            } label: { Label("Keyboard options", systemImage: "pianokeys") }
                .fixedSize()
        }
    }
    private var coach: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                HStack { Image(systemName: "sparkle"); Text("COACH").font(ReplayTheme.mono()); Spacer() }.foregroundStyle(ReplayTheme.accent)
                if model.phase == .feedback, let evaluation = model.evaluation {
                    ReplayFeedbackCard(evaluation: evaluation.evaluation, feedback: evaluation.feedbackText, reasoning: evaluation.reasoning, completed: evaluation.tuneAcquired == true)
                    Button(evaluation.tuneAcquired == true ? "Back to Tunes" : evaluation.suggestNewNugget ? "Continue" : "Try again", action: model.continueAfterFeedback)
                        .buttonStyle(ReplayButtonStyle(kind: .secondary))
                } else {
                    Text(model.currentItem?.instruction ?? "Listen, then play the phrase.").font(.body).fixedSize(horizontal: false, vertical: true)
                    if model.phase == .evaluating { ProgressView("Your coach is listening…").tint(ReplayTheme.accent) }
                    else if model.phase == .recording {
                        Text("Play after the count-in. Touch the keys or use your MIDI piano.").font(.caption).foregroundStyle(ReplayTheme.muted)
                        Button("Finish attempt", systemImage: "stop.circle", action: model.stopAndEvaluate).buttonStyle(ReplayButtonStyle(kind: .destructive))
                    } else {
                        Button("Record attempt", systemImage: "record.circle", action: model.startRecording)
                            .buttonStyle(ReplayButtonStyle(kind: .secondary)).disabled(model.phase != .practice)
                        Text("A four-beat count-in gives you time to get ready.").font(.caption).foregroundStyle(ReplayTheme.muted)
                    }
                }
            }.padding(22).frame(maxWidth: .infinity, alignment: .leading)
        }.replayChrome()
    }
    private var transport: some View {
        VStack(spacing: 6) {
            ViewThatFits(in: .horizontal) {
                transportButtons(labels: true)
                transportButtons(labels: false)
            }.padding(8).replayChrome(radius: 32)
            if model.isDemoPlaying || model.phase == .recording {
                TimelineView(.periodic(from: .now, by: 0.1)) { _ in
                    let time = model.clock.inputTime
                    Text(model.isDemoPlaying && !model.clock.isRunning ? "PREPARING HIGHWAY" : model.isDemoPlaying && time < 0 ? "GET READY" : time.isFinite && time < 0 ? "COUNT IN · \(Int(ceil(-time / (60.0/90))))" : model.isDemoPlaying ? "LISTEN" : "RECORDING · \(model.score) PTS · \(model.streak) STREAK")
                        .font(ReplayTheme.mono(11)).foregroundStyle(ReplayTheme.accent)
                }
            }
        }.padding(.horizontal, 12)
    }
    private func transportButtons(labels: Bool) -> some View {
        HStack(spacing: 6) {
            Button("Previous", systemImage: "backward.end", action: model.previousItem)
                .labelStyle(.iconOnly).disabled(busy || model.currentIndex == 0).keyboardShortcut(.leftArrow, modifiers: [])
            Button(model.isDemoPlaying ? "Stop" : "Replay", systemImage: model.isDemoPlaying ? "stop.fill" : "play.fill") {
                if model.isDemoPlaying { model.stopDemo() } else { model.playDemo() }
            }.buttonStyle(ReplayButtonStyle()).disabled(busy).keyboardShortcut(.space, modifiers: [])
            Button("Restart", systemImage: "arrow.counterclockwise", action: model.restart).disabled(busy).keyboardShortcut("r", modifiers: [])
                .labelStyle(TransportLabelStyle(showTitle: labels))
            Button("Hints", systemImage: model.showHints ? "lightbulb.fill" : "lightbulb") { model.showHints.toggle() }
                .labelStyle(TransportLabelStyle(showTitle: labels))
            // Recording remains reachable when the coach card is hidden.
            if model.phase == .feedback {
                Button("Continue", systemImage: "arrow.right", action: model.continueAfterFeedback).labelStyle(.iconOnly)
            } else {
                Button(model.phase == .recording ? "Finish" : "Record", systemImage: model.phase == .recording ? "stop.circle" : "record.circle") {
                    if model.phase == .recording { model.stopAndEvaluate() } else { model.startRecording() }
                }.disabled(model.phase != .practice && model.phase != .recording).labelStyle(.iconOnly)
            }
            Button("Next", systemImage: "forward.end", action: model.nextItem)
                .labelStyle(.iconOnly).disabled(busy || model.currentIndex+1 >= model.practicePlan.count).keyboardShortcut(.rightArrow, modifiers: [])
        }.fixedSize(horizontal: true, vertical: false).buttonStyle(.borderless).controlSize(.large).tint(ReplayTheme.ink)
    }
}
private struct TransportLabelStyle: LabelStyle {
    let showTitle: Bool
    func makeBody(configuration: Configuration) -> some View { HStack { configuration.icon; if showTitle { configuration.title } }.padding(.horizontal, 8).frame(minHeight: 44) }
}

struct KeyboardDock: View {
    @EnvironmentObject private var model: LessonViewModel
    var full = false
    var includeHighway = false
    var toolbar: AnyView? = nil
    @State private var toolbarHeight: CGFloat = 52
    @State private var midiConnected = false
    var body: some View {
        GeometryReader { proxy in
            let range = visibleRange(width: proxy.size.width)
            let needsFullRange = model.targetSequence?.notes.contains(where: { !range.contains($0.pitch) }) == true
            ZStack(alignment: .top) {
            if full || needsFullRange {
                ScrollView(.horizontal) {
                    instrument(range: 21...108, height: proxy.size.height).frame(width: max(proxy.size.width, 52 * 52), height: proxy.size.height)
                }.scrollIndicators(.visible).defaultScrollAnchor(.center)
            } else if proxy.size.width < 600 {
                ScrollView(.horizontal) { instrument(range: range, height: proxy.size.height).frame(width: 600, height: proxy.size.height) }.defaultScrollAnchor(.leading)
            } else { instrument(range: range, height: proxy.size.height) }
                if includeHighway, let toolbar {
                    toolbar
                        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { toolbarHeight = $0 }
                        .padding(.top, max(0, proxy.size.height - keyboardHeight(proxy.size.height) - toolbarHeight - (model.showKeyboard ? ReplayTheme.pianoRailGap : 0)))
                }
            }

        }.background(ReplayTheme.background)
            .onReceive(model.midi.$isConnected) { midiConnected = $0 }
    }
    private func visibleRange(width: CGFloat) -> ClosedRange<Int> {
        let defaultRange = width >= 900 ? 48...72 : 48...67
        let notes = model.targetSequence?.notes ?? []
        guard let low = notes.map(\.pitch).min(), let high = notes.map(\.pitch).max(),
              low < defaultRange.lowerBound || high > defaultRange.upperBound else { return defaultRange }
        let start = max(24, min(84, (low / 12) * 12))
        return start...min(108, start + (width >= 900 ? 24 : 19))
    }
    private func keyboardHeight(_ height: CGFloat) -> CGFloat {
        model.showKeyboard ? PianoGeometry.panelHeight(min(300, max(160, height * 0.4)), midiConnected: midiConnected) : 0
    }
    private func instrument(range: ClosedRange<Int>, height: CGFloat) -> some View {
        let keyboard = PianoKeyboardView(range: range, held: model.heldPitches.union(includeHighway ? model.judgedPitches : []), demo: model.demoPitches,
                                        armed: includeHighway ? model.armedPitches : [], transparentRail: includeHighway,
                                        tuneRange: includeHighway ? tuneRange : nil,
                                        onDown: { model.noteDown($0, $1) }, onUp: { model.noteUp($0) })
        return Group {
            if includeHighway {
                HighwayKeyboardSurface(scene: model.highway, keyboard: keyboard, keyboardHeight: keyboardHeight(height), toolbarHeight: toolbar == nil ? 0 : toolbarHeight)
            } else { keyboard }
        }
    }
    private var tuneRange: ClosedRange<Int>? {
        guard let notes = model.targetSequence?.notes, let low = notes.map(\.pitch).min(), let high = notes.map(\.pitch).max() else { return nil }
        return low...high
    }

}

struct MetronomeControl: View {
    @ObservedObject var engine: MetronomeEngine
    var bpm: Double = 90
    var body: some View {
        Button("Metronome", systemImage: "metronome") {
            if engine.isPlaying { engine.stop() } else { engine.start(bpm: bpm, timeSignature: "4/4") }
        }.tint(engine.isPlaying ? ReplayTheme.accent : ReplayTheme.ink)
            .accessibilityValue(engine.isPlaying ? "On, \(Int(bpm)) beats per minute" : "Off")
            .keyboardShortcut("m", modifiers: [])
    }
}

struct FreePlayView: View {
    @EnvironmentObject private var model: LessonViewModel
    @State private var full = false
    @State private var bpm = 90.0
    @State private var midiConnected = false
    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 24) {
                Spacer(minLength: 0)
                Image(systemName: "waveform").font(.system(size: 40, weight: .light)).foregroundStyle(ReplayTheme.accent)
                Text(model.heldPitches.isEmpty ? "Make room for music." : model.heldPitches.sorted().map(PianoGeometry.label).joined(separator: "  "))
                    .font(ReplayTheme.display(36)).multilineTextAlignment(.center).padding(.horizontal)
                Text("Explore the keys. Follow an idea. There’s no score here.").foregroundStyle(ReplayTheme.muted).multilineTextAlignment(.center)
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: 20) { freePlayControls }
                    VStack(spacing: 16) { freePlayControls }
                }.padding(20).replayChrome().padding(.horizontal)
                Spacer(minLength: 0)
                if model.showKeyboard { KeyboardDock(full: full).frame(height: PianoGeometry.panelHeight(min(300, max(190, proxy.size.height * 0.45)), midiConnected: midiConnected)) }
                else { Button("Show keyboard", systemImage: "pianokeys") { model.showKeyboard = true }.buttonStyle(ReplayButtonStyle(kind: .secondary)).padding(.bottom, 24) }
            }
        }.background(ReplayTheme.background)
        .onReceive(model.midi.$isConnected) { midiConnected = $0 }
        .onChange(of: bpm) { _, newValue in if model.metronome.isPlaying { model.metronome.start(bpm: newValue, timeSignature: "4/4") } }
    }
    @ViewBuilder private var freePlayControls: some View {
                    MetronomeControl(engine: model.metronome, bpm: bpm)
                    Stepper("\(Int(bpm)) BPM", value: $bpm, in: 40...200, step: 5).frame(maxWidth: 210)
                    Toggle("88 keys", isOn: $full).fixedSize()
    }
}

/// One scene extends behind the dock; only its exposed height determines approach speed.
struct HighwayKeyboardSurface: View {
    let scene: NoteHighwayScene
    let keyboard: PianoKeyboardView
    var keyboardHeight: CGFloat
    var toolbarHeight: CGFloat
    var body: some View {
        GeometryReader { proxy in
            let gap = toolbarHeight > 0 && keyboardHeight > 0 ? ReplayTheme.pianoRailGap : 0
            let exposed = max(0, proxy.size.height - keyboardHeight - toolbarHeight - gap)
            let rail = keyboardHeight > 0 ? PianoGeometry.railHeight : 0
            let covered = toolbarHeight + gap + rail
            ZStack(alignment: .top) {
                NoteHighwayView(scene: scene)
                    .frame(height: exposed + covered)
                    .onAppear { scene.visibleRange = keyboard.range; scene.bottomOcclusion = covered }
                    .onChange(of: keyboard.range) { _, value in scene.visibleRange = value }
                    .onChange(of: covered) { _, value in scene.bottomOcclusion = value }
                PianoDockBackdrop().frame(height: covered).offset(y: exposed)
                if keyboardHeight > 0 { keyboard.frame(height: keyboardHeight).offset(y: exposed + toolbarHeight + gap) }
            }
        }
    }
}
