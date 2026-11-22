import SwiftUI

/// A local component catalog: no API calls, MIDI events or progress writes.
struct DesignSystemView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @State private var darkAppearance = true
    @State private var silent = false
    @State private var tempo = 90.0
    @State private var title = "Evening practice"
    @State private var lastAction = "Try a component below. These examples do not affect your practice."
    private var columns: [GridItem] {
        [GridItem(dynamicTypeSize.isAccessibilitySize ? .flexible() : .adaptive(minimum: 240), spacing: ReplayTheme.Space.medium)]
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: ReplayTheme.Space.page) {
                    VStack(alignment: .leading, spacing: ReplayTheme.Space.small) {
                        Text("Replay Nat").font(.largeTitle.bold())
                        Text("The native components used in your tune library and practice screens.")
                            .foregroundStyle(.secondary)
                        Toggle("Dark appearance", isOn: $darkAppearance)
                    }
                    catalogSection("Colors") {
                        LazyVGrid(columns: columns) {
                            swatch("Background", ReplayTheme.background)
                            swatch("Surface", ReplayTheme.surface)
                            swatch("Primary action", ReplayTheme.accent)
                            swatch("Success", ReplayTheme.success)
                            swatch("Needs practice", ReplayTheme.warning)
                            swatch("Error", ReplayTheme.destructive)
                        }
                    }
                    catalogSection("Typography") {
                        Text("Page title · Tunes").font(.largeTitle.bold())
                        Text("Section title · Practice").font(.title2.bold())
                        Text("Card title · Intro").font(.headline)
                        Text("Body · Listen once, then play at your own pace.").font(.body)
                        Text("Caption · MIDI connected").font(.caption).foregroundStyle(.secondary)
                        Text("All text uses Dynamic Type. Labels and symbols accompany status colors.")
                            .font(.footnote).foregroundStyle(.secondary)
                    }
                    catalogSection("Spacing & shape") {
                        Text("4, 8, 16, 24 and 32 pt spacing. Cards use a 12 pt radius. Buttons have at least a 44 pt touch target.")
                        ForEach([4, 8, 16, 24, 32], id: \.self) { value in
                            HStack {
                                Text("\(value) pt").font(.caption.monospacedDigit()).frame(width: 44, alignment: .leading)
                                RoundedRectangle(cornerRadius: 4).fill(ReplayTheme.accent)
                                    .frame(width: CGFloat(value * 5), height: 12)
                            }
                        }
                    }
                    catalogSection("Actions") {
                        ViewThatFits(in: .horizontal) {
                            HStack { actionExamples }
                            VStack(alignment: .leading) { actionExamples }
                        }
                        Button("Complete Intro first") {}.buttonStyle(ReplayButtonStyle()).disabled(true)
                        Text(lastAction).font(.subheadline).foregroundStyle(.secondary)
                            .accessibilityIdentifier("design-system-action-result")
                    }
                    catalogSection("Controls") {
                        ReplayCard {
                            VStack(alignment: .leading, spacing: ReplayTheme.Space.medium) {
                                TextField("Tune title", text: $title).textFieldStyle(.roundedBorder)
                                Toggle("Silent while I play", isOn: $silent)
                                Text("Tempo · \(Int(tempo)) BPM").monospacedDigit()
                                Slider(value: $tempo, in: 40...180, step: 1) { Text("Tempo") }
                            }
                        }
                    }
                    catalogSection("Tune cards") {
                        LazyVGrid(columns: columns) {
                            ReplayTuneCard(title: "Intro", unlocked: true) { lastAction = "Selected Intro — preview only." }
                            ReplayTuneCard(title: "St Louis Blues", unlocked: false, prerequisites: ["Intro"]) {}
                            ReplayTuneCard(title: "A longer tune title that wraps on a smaller screen", unlocked: false, prerequisites: ["Intro", "First steps"]) {}
                        }
                    }
                    catalogSection("Feedback") {
                        ReplayFeedbackCard(evaluation: "pass", feedback: "Well played. Your rhythm stayed steady.", completed: true)
                        ReplayFeedbackCard(evaluation: "close", feedback: "Almost there. Try the last phrase once more.", reasoning: "Listen for the space between the final two notes.")
                        ReplayFeedbackCard(evaluation: "retry", feedback: "Take your time. Listen to the demo and try again.")
                    }
                    catalogSection("Connection & loading") {
                        ReplayStatus(title: "MIDI connected", systemImage: "checkmark.circle.fill", color: ReplayTheme.success)
                        ReplayStatus(title: "No MIDI device — connect your piano", systemImage: "cable.connector")
                        ProgressView("Preparing practice…")
                    }
                }
                .padding(ReplayTheme.Space.large)
                .frame(maxWidth: 1000, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .background(ReplayTheme.background)
            .navigationTitle("Design system")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .tint(ReplayTheme.accent)
        .preferredColorScheme(darkAppearance ? .dark : .light)
    }

    @ViewBuilder private var actionExamples: some View {
        Button("Start practice") { lastAction = "Primary action pressed — preview only." }
            .buttonStyle(ReplayButtonStyle())
        Button("Play demo") { lastAction = "Secondary action pressed — no audio plays." }
            .buttonStyle(ReplayButtonStyle(kind: .secondary))
        Button("Delete example") { lastAction = "Destructive style pressed — nothing was deleted." }
            .buttonStyle(ReplayButtonStyle(kind: .destructive))
    }

    private func catalogSection<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: ReplayTheme.Space.medium) {
            Text(title).font(.title2.bold()).accessibilityAddTraits(.isHeader)
            content()
        }
    }
    private func swatch(_ title: String, _ color: Color) -> some View {
        ReplayCard {
            VStack(alignment: .leading, spacing: ReplayTheme.Space.small) {
                RoundedRectangle(cornerRadius: ReplayTheme.radius).fill(color)
                    .overlay(RoundedRectangle(cornerRadius: ReplayTheme.radius).stroke(ReplayTheme.border, lineWidth: 1))
                    .frame(height: 56)
                Text(title).font(.subheadline)
            }
        }
    }
}

#Preview { DesignSystemView() }
