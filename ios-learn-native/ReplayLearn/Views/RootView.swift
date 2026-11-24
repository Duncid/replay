import SwiftUI
import CoreAudioKit

struct RootView: View {
    @EnvironmentObject private var model: LessonViewModel
    @Environment(\.scenePhase) private var scenePhase
    @State private var tab: String = {
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--preview-freeplay") { return "play" }
        if ProcessInfo.processInfo.arguments.contains("--preview-progress") { return "progress" }
        #endif
        return "tunes"
    }()
    @State private var settings = false
    @State private var search = ""
    private var inPractice: Bool { model.tuneKey != nil && model.phase != .library && model.phase != .loadingLibrary }
    var body: some View {
        Group {
            if inPractice {
                NavigationStack { practiceContent.navigationBarTitleDisplayMode(.inline) }
            } else {
                GeometryReader { geometry in
                    TabView(selection: $tab) {
                        Tab("Tunes", systemImage: "music.note.list", value: "tunes") {
                            NavigationStack {
                                libraryContent.navigationTitle("Replay Nat").navigationBarTitleDisplayMode(.inline).toolbar { navigationTools }
                            }.searchable(text: $search, placement: .navigationBarDrawer(displayMode: .always), prompt: "Find a tune")
                        }
                        Tab("Free Play", systemImage: "pianokeys", value: "play") {
                            NavigationStack {
                                FreePlayView().navigationTitle("Free Play").navigationBarTitleDisplayMode(.inline).toolbar { navigationTools }
                            }
                        }
                        Tab("Progress", systemImage: "chart.bar.xaxis", value: "progress") {
                            NavigationStack {
                                ProgressLibraryView().navigationTitle("Your progress").navigationBarTitleDisplayMode(.inline).toolbar { navigationTools }
                            }
                        }
                    }
                    .tabViewStyle(.sidebarAdaptable)
                    .defaultAdaptableTabBarPlacement(geometry.size.width >= 900 ? .sidebar : .tabBar)
                    .tabViewSidebarHeader {
                        HStack { Image(systemName: "pianokeys").foregroundStyle(ReplayTheme.accent); Text("Replay Nat").font(ReplayTheme.display(24)) }.padding(.vertical, 16)
                    }
                    .tabViewSidebarFooter { Text("A little practice. A little progress.").font(.caption).foregroundStyle(ReplayTheme.muted).padding(.vertical, 12) }
                }
            }
        }
        .background(ReplayTheme.background)
        .tint(ReplayTheme.accent).foregroundStyle(ReplayTheme.ink).preferredColorScheme(.dark)
        .sheet(isPresented: $settings) { SettingsView(showAccount: model.usesAccount) }
        .onChange(of: tab) { _, _ in model.suspend() }
        .onChange(of: scenePhase) { _, phase in if phase != .active { model.suspend() } }
    }
    @ToolbarContentBuilder private var navigationTools: some ToolbarContent {
        ToolbarItemGroup(placement: .topBarTrailing) {
            MIDIControl()
            Button("Settings", systemImage: "gearshape") { settings = true }
        }
    }
    @ViewBuilder private var libraryContent: some View {
        switch model.phase {
        case .loadingLibrary: loading("Opening your tune library…")
        case .error(let message): error(message)
        default: WelcomeView(search: $search)
        }
    }
    @ViewBuilder private var practiceContent: some View {
        switch model.phase {
        case .loadingTune:
            loading("Preparing your practice…")
                .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Tunes", systemImage: "chevron.left", action: model.leaveTune) } }
        case .error(let message):
            error(message).toolbar { ToolbarItem(placement: .topBarLeading) { Button("Tunes", systemImage: "chevron.left", action: model.leaveTune) } }
        default: LessonView()
        }
    }
    private func loading(_ title: String) -> some View {
        VStack(spacing: 20) { ProgressView().tint(ReplayTheme.accent); Text(title).font(.headline); Text("Your piano is almost ready.").foregroundStyle(ReplayTheme.muted) }
            .frame(maxWidth: .infinity, maxHeight: .infinity).background(ReplayTheme.background)
    }
    private func error(_ message: String) -> some View {
        ContentUnavailableView {
            Label("Couldn’t load practice", systemImage: "wifi.exclamationmark")
        } description: { Text(message) } actions: {
            Button("Try again") { if let key = model.tuneKey { model.startTune(key) } else { Task { await model.loadLibrary() } } }.buttonStyle(ReplayButtonStyle())
        }
    }
}

struct MIDIControl: View {
    @EnvironmentObject private var model: LessonViewModel
    @State private var presented = false
    var body: some View {
        Button("MIDI", systemImage: "pianokeys") { model.midi.start(); presented.toggle() }
            .keyboardShortcut("k", modifiers: .command)
            .popover(isPresented: $presented) { MIDISettingsView(midi: model.midi, showKeyboard: $model.showKeyboard).presentationCompactAdaptation(.sheet) }
    }
}

struct MIDISettingsView: View {
    @ObservedObject var midi: MidiManager
    @Binding var showKeyboard: Bool
    @State private var bluetooth = false
    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            HStack { Text("MIDI & keyboard").font(.headline); Spacer(); Image(systemName: "pianokeys").foregroundStyle(ReplayTheme.accent) }
            Text(midi.isConnected ? "Connected inputs" : "Connect a piano with USB, or browse Bluetooth MIDI devices.").font(.subheadline).foregroundStyle(ReplayTheme.muted)
            ForEach(midi.sourceNames, id: \.self) { name in
                HStack { Image(systemName: "pianokeys").foregroundStyle(ReplayTheme.accent); Text(name); Spacer(); Image(systemName: "checkmark.circle.fill").foregroundStyle(ReplayTheme.accent) }.frame(minHeight: 44)
            }
            Button { bluetooth = true } label: { Label("Bluetooth MIDI devices", systemImage: "antenna.radiowaves.left.and.right") }
                .buttonStyle(ReplayButtonStyle(kind: .secondary))
            Divider()
            Toggle("Show on-screen keyboard", isOn: $showKeyboard)
            Text("Touch and MIDI both work for practice attempts. Audio uses this iPad’s current output.").font(.caption).foregroundStyle(ReplayTheme.muted)
        }.padding(24).frame(idealWidth: 340, maxWidth: 380).tint(ReplayTheme.accent).preferredColorScheme(.dark)
        .sheet(isPresented: $bluetooth) { BluetoothMIDIView().ignoresSafeArea(edges: .bottom).presentationDetents([.medium, .large]) }
    }
}
struct BluetoothMIDIView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> CABTMIDICentralViewController { CABTMIDICentralViewController() }
    func updateUIViewController(_ controller: CABTMIDICentralViewController, context: Context) {}
}

struct SettingsView: View {
    var showAccount = true
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            List {
                if showAccount {
                    AccountSettingsView()
                }
                Section("Replay Nat") {
                    Label("Native piano practice for iPad", systemImage: "pianokeys")
                    Text("Tune acquisitions belong to your practice profile and sync with Replay Cloud. Recent attempts and resume positions are saved per profile on this iPad.").font(.subheadline).foregroundStyle(.secondary)
                }
                Section("Design & accessibility") {
                    NavigationLink { DesignSystemView() } label: { Label("Design system", systemImage: "paintpalette") }
                    Text("Replay follows Dynamic Type, Increase Contrast and Reduce Transparency. Pitch labels stay fixed to preserve alignment with piano keys.").font(.subheadline).foregroundStyle(.secondary)
                }
                Section("Keyboard shortcuts") {
                    LabeledContent("Replay / stop", value: "Space")
                    LabeledContent("Restart section", value: "R")
                    LabeledContent("Previous / next section", value: "← / →")
                    LabeledContent("Metronome", value: "M")
                    LabeledContent("MIDI", value: "⌘K")
                }
            }.navigationTitle("Settings").toolbar { Button("Done") { dismiss() } }
        }.tint(ReplayTheme.accent).preferredColorScheme(.dark)
    }
}
