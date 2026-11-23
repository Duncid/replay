import SwiftUI

/// Living catalog: uses the production components, not look-alike examples.
struct DesignSystemView: View {
    @State private var held: Set<Int> = []
    @StateObject private var piano = PianoAudioEngine()
    @State private var compact = false
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 32) {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Replay / Acid").font(ReplayTheme.display(44))
                        Text("Native design system").font(.title3)
                        Text("System owns chrome. Brand owns content.").foregroundStyle(ReplayTheme.muted)
                    }
                    section("01 / Foundations") {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 150))], spacing: 16) {
                            swatch("Background", "060709", ReplayTheme.background)
                            swatch("Surface", "0F1116", ReplayTheme.surface)
                            swatch("Raised", "181B22", ReplayTheme.raised)
                            swatch("Primary", "C6FF1A", ReplayTheme.accent)
                            swatch("AI", "25B8FF", ReplayTheme.ai)
                            swatch("Ink", "F3F5F7", ReplayTheme.ink)
                            swatch("Muted", "8F95A6", ReplayTheme.muted)
                            swatch("Destructive", "FF4D4D", ReplayTheme.destructive)
                        }
                        Text("Space Grotesk / Display").font(ReplayTheme.display(30))
                        Text("SF Pro / Interface, instructions and feedback").font(.body)
                        Text("JetBrains Mono / TAGS · 90 BPM · C4").font(ReplayTheme.mono(13))
                        Text("Spacing 4 · 8 · 12 · 16 · 24 · 32. Cards 22 pt. Popovers 26 pt. Controls 10 pt. Minimum control target 44 pt.").font(.subheadline).foregroundStyle(ReplayTheme.muted)
                    }
                    section("02 / Actions & materials") {
                        ViewThatFits {
                            HStack(spacing: 12) { actions }
                            VStack(alignment: .leading, spacing: 12) { actions }
                        }
                        HStack { Image(systemName: "sparkle"); Text("Glass is reserved for navigation, coach and transport.") }.padding(20).replayChrome()
                        ReplayCard { Text("Tune cards, note highway and keyboard use solid surfaces. One filled primary action per screen. No decorative idle glow.") }
                    }
                    section("03 / The piano keyboard") {
                        Text("A shared layout drives the rail, keys and hit testing. White keys render first; black keys win hit tests. Ten-finger input, chords, sliding and cancellation use UIKit touches.").foregroundStyle(ReplayTheme.muted)
                        Toggle("Narrow range · C3–G4", isOn: $compact)
                        PianoKeyboardView(range: compact ? 48...67 : 48...72, held: held, demo: [64], onDown: { pitch, velocity in
                            held.insert(pitch); piano.play(pitch: pitch, velocity: velocity)
                        }, onUp: { pitch in held.remove(pitch); piano.release(pitch: pitch) })
                            .frame(height: 300)
                        Text("Play this keyboard. Lime = your touch. Blue E4 = demo state. Pitch colors identify the notes in the rail; keys have no printed labels.").font(.caption).foregroundStyle(ReplayTheme.muted)
                        Text("52 pt rail: two 24 pt rows + two 2 pt gaps. Keys: 248 pt. White gap/padding: 2 pt. Black keys: 58% of white width and key height. Wide range: C3–C5; narrow: C3–G4; full range scrolls without shrinking keys.").font(.subheadline)
                        HStack { ForEach([60,62,64,65,67,69,71], id: \.self) { pitch in
                            Text(PianoGeometry.label(pitch)).font(ReplayTheme.mono()).frame(maxWidth: .infinity).padding(.vertical, 16)
                                .background(ReplayTheme.pitch(pitch), in: RoundedRectangle(cornerRadius: 8)).foregroundStyle(ReplayTheme.onAccent)
                        } }
                        Text("Sharps inherit the lower natural’s hue. Idle sharp labels use white on C♯, D♯, A♯ and dark ink on F♯, G♯ to preserve contrast.").font(.caption).foregroundStyle(ReplayTheme.muted)
                    }
                    section("04 / Note Highway") { NativeHighwayCatalog() }
                    section("05 / Content & feedback") {
                        ReplayFeedbackCard(evaluation: "pass", feedback: "Your timing is steady. Keep the phrase connected.", completed: true)
                        ReplayFeedbackCard(evaluation: "close", feedback: "Listen once more, then try the opening notes slowly.")
                        Text("Catalog examples only. Live library thumbnails use published notes; progress uses evaluated attempts and server-confirmed acquisitions.").font(.caption).foregroundStyle(ReplayTheme.muted)
                    }
                    section("06 / Accessibility") {
                        Text("Dark appearance. Dynamic Type for interface and instructions; fixed 11 pt rail labels preserve key alignment. Each key has a VoiceOver pitch label and an activation action. The decorative rail is not a second accessibility element.")
                        Text("Reduce Transparency substitutes solid chrome. Increase Contrast strengthens component outlines. Input highlights have no animation. Every state has a label or symbol in addition to color.").foregroundStyle(ReplayTheme.muted)
                    }
                }.padding(32).frame(maxWidth: 1200).frame(maxWidth: .infinity)
            }.background(ReplayTheme.background).navigationTitle("Design system").navigationBarTitleDisplayMode(.inline)
        }.foregroundStyle(ReplayTheme.ink).tint(ReplayTheme.accent).preferredColorScheme(.dark)
            .onAppear { piano.preload() }.onDisappear { piano.stopAll() }
    }
    @ViewBuilder private var actions: some View {
        Button("Replay", systemImage: "play.fill") {}.buttonStyle(ReplayButtonStyle())
        Button("Restart", systemImage: "arrow.counterclockwise") {}.buttonStyle(ReplayButtonStyle(kind: .secondary))
        Button("Finish", systemImage: "stop.circle") {}.buttonStyle(ReplayButtonStyle(kind: .destructive))
        Button("Unavailable") {}.buttonStyle(ReplayButtonStyle()).disabled(true)
    }
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 20) { Text(title.uppercased()).font(ReplayTheme.mono(12)).foregroundStyle(ReplayTheme.accent); content() }
    }
    private func swatch(_ title: String, _ hex: String, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            RoundedRectangle(cornerRadius: 12).fill(color).frame(height: 64).overlay(RoundedRectangle(cornerRadius: 12).stroke(ReplayTheme.strongBorder))
            Text(title).font(.subheadline); Text(hex).font(ReplayTheme.mono()).foregroundStyle(ReplayTheme.muted)
        }
    }
}


/// Frozen reference states rendered by the production SpriteKit scene.
private struct NativeHighwayCatalog: View {
    @State private var beat = 4.12
    @State private var midiConnected = false
    private var keyboardHeight: CGFloat { PianoGeometry.panelHeight(248, midiConnected: midiConnected) }
    @State private var scene = NoteHighwayScene(clock: HighwayClock())
    @State private var armed: Set<Int> = []
    private let fixture: [(Int, Double, Double)] = [(60,0,1),(62,1,1),(64,2,1),(65,3,1),(67,4,2),(48,4,2),(55,4,2),(64,6,1),(67,7,1),(69,8,1),(57,8,2),(67,9,1),(64,10,2),(52,10,2)]
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("One geometry aligns falling notes, armed rail cells and keys. Solid = player; outline = bot. Misses stay neutral. The fixed piano toolbar and rail share a blurred surface; notes pass behind them after crossing the lime hit line. Practice scoring remains separate from drawing.").foregroundStyle(ReplayTheme.muted)
            Picker("Reference state", selection: $beat) {
                Text("Beat 4.12 · Perfect").tag(4.12)
                Text("Beat 8.2 · Miss").tag(8.2)
            }.pickerStyle(.segmented)
            Toggle("MIDI connected · compact keys", isOn: $midiConnected)
            HighwayKeyboardSurface(scene: scene,
                keyboard: PianoKeyboardView(held: beat < 5 ? [67] : [], demo: beat < 5 ? [48,55] : [57], armed: armed, transparentRail: true, tuneRange: 48...69, onDown: { _,_ in }, onUp: { _ in }), keyboardHeight: keyboardHeight, toolbarHeight: 52)
                .frame(height: 660)
                .overlay(alignment: .top) {
                    HStack { Text("PIANO"); Spacer(); Text("120 BPM · MIDI") }.font(ReplayTheme.mono(11)).padding(.horizontal, 12).frame(height: 52)
                        .overlay(alignment: .top) { Rectangle().fill(ReplayTheme.border).frame(height: 1) }.padding(.top, 660 - keyboardHeight - 52 - ReplayTheme.pianoRailGap)
                }
            Text("Playing uses the audio render clock. Paused freezes position. Reduce Motion keeps scrolling but removes sparks and feedback movement. Timing windows remain 80 ms perfect / 180 ms good.").font(.caption).foregroundStyle(ReplayTheme.muted)
        }.onAppear(perform: configure).onChange(of: beat) { _,_ in configure() }
    }
    private func configure() {
        scene.bpm = 120; scene.previewBeat = beat; scene.previewBotPitches = [48,55,57,52]
        scene.onArmedChange = { armed = $0 }
        let notes = fixture.map { Note(pitch: $0.0, startTime: $0.1/2, endTime: ($0.1+$0.2)/2, velocity: 90) }.sorted { $0.startTime < $1.startTime }
        scene.load(sequence: NoteSequence(notes: notes, totalTime: 6))
        for (i,note) in notes.enumerated() where note.startTime*2 <= beat && !scene.previewBotPitches.contains(note.pitch) {
            scene.apply(.init(grade: note.pitch == 69 ? .miss : .perfect, pitch: note.pitch, noteIndex: i), streak: 0)
        }
        scene.update(0)
    }
}
