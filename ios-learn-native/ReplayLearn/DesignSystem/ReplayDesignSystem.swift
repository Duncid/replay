import SwiftUI

/// Acid tokens are native-owned. Glass belongs to controls; content stays solid.
enum ReplayTheme {
    static let background = Color(hex: 0x060709)
    static let surface = Color(hex: 0x0F1116)
    static let raised = Color(hex: 0x181B22)
    static let border = Color(hex: 0x262A34)
    static let strongBorder = Color(hex: 0x5C6272)
    static let ink = Color(hex: 0xF3F5F7)
    static let muted = Color(hex: 0x8F95A6)
    static let accent = Color(hex: 0xC6FF1A)
    static let ai = Color(hex: 0x25B8FF)
    static let onAccent = Color(hex: 0x07080B)
    static let success = accent
    static let warning = Color(hex: 0xFFE14D)
    static let destructive = Color(hex: 0xFF4D4D)
    static let radius: CGFloat = 22
    static let controlHeight: CGFloat = 44
    static let pianoRailGap: CGFloat = 8
    static let pianoDockTint = 0.7
    static let pitchHex: [UInt32] = [0xFF4D5E,0xFF4D5E,0xFF9A3D,0xFF9A3D,0xFFE14D,0x4DFF88,0x4DFF88,0x1FE0F0,0x1FE0F0,0x4D8DFF,0x4D8DFF,0xA66BFF]
    static func pitch(_ midi: Int) -> Color { Color(hex: pitchHex[(midi % 12 + 12) % 12]) }
    static func display(_ size: CGFloat) -> Font { .custom("SpaceGrotesk-Light_Regular", size: size, relativeTo: .largeTitle).weight(.semibold) }
    static func mono(_ size: CGFloat = 11) -> Font { .custom("JetBrainsMono-Regular", size: size, relativeTo: .caption) }
    enum Space {
        static let tiny: CGFloat = 4, small: CGFloat = 8, medium: CGFloat = 16, large: CGFloat = 24, page: CGFloat = 32
    }
}

extension Color {
    init(hex: UInt32) { self.init(.sRGB, red: Double((hex >> 16) & 255)/255, green: Double((hex >> 8) & 255)/255, blue: Double(hex & 255)/255, opacity: 1) }
}

extension UIColor {
    /// Scales RGB toward black; used to darken sharp notes like the web note rail does.
    func darkened(_ factor: CGFloat) -> UIColor {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        return UIColor(red: r*factor, green: g*factor, blue: b*factor, alpha: a)
    }
}

struct ReplayChrome: ViewModifier {
    var radius: CGFloat = 22
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    @Environment(\.colorSchemeContrast) private var contrast
    func body(content: Content) -> some View {
        if reduceTransparency {
            content.background(ReplayTheme.raised, in: RoundedRectangle(cornerRadius: radius))
                .overlay(RoundedRectangle(cornerRadius: radius).stroke(ReplayTheme.strongBorder, lineWidth: 1))
        } else {
            content.glassEffect(.regular, in: .rect(cornerRadius: radius))
                .overlay(RoundedRectangle(cornerRadius: radius).stroke(contrast == .increased ? ReplayTheme.strongBorder : .clear, lineWidth: 1))
        }
    }
}
extension View { func replayChrome(radius: CGFloat = 22) -> some View { modifier(ReplayChrome(radius: radius)) } }

struct ReplayCard<Content: View>: View {
    @Environment(\.colorSchemeContrast) private var contrast
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content.frame(maxWidth: .infinity, alignment: .leading).padding(24)
            .background(ReplayTheme.surface, in: RoundedRectangle(cornerRadius: ReplayTheme.radius))
            .overlay(RoundedRectangle(cornerRadius: ReplayTheme.radius).stroke(contrast == .increased ? ReplayTheme.strongBorder : ReplayTheme.border, lineWidth: 1))
    }
}

struct ReplayButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, destructive }
    var kind: Kind = .primary
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.font(.body.weight(.semibold)).padding(.horizontal, 18).padding(.vertical, 10)
            .frame(minHeight: 44)
            .foregroundStyle(kind == .primary ? ReplayTheme.onAccent : kind == .destructive ? ReplayTheme.destructive : ReplayTheme.ink)
            .background(kind == .primary ? ReplayTheme.accent : ReplayTheme.raised, in: RoundedRectangle(cornerRadius: 10))
            .overlay(RoundedRectangle(cornerRadius: 10).stroke(kind == .destructive ? ReplayTheme.destructive : .clear))
            .opacity(enabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
    }
}

struct ReplayStatus: View {
    let title: String
    let systemImage: String
    var color: Color = ReplayTheme.muted
    var font: Font = .subheadline
    var body: some View { Label(title, systemImage: systemImage).font(font).foregroundStyle(color).fixedSize(horizontal: false, vertical: true) }
}

struct TuneThumbnail: View {
    var sequence: NoteSequence?
    var body: some View {
        Canvas { context, size in
            let notes = Array((sequence?.notes ?? []).prefix(14))
            let low = notes.map(\.pitch).min() ?? 60, high = notes.map(\.pitch).max() ?? 72
            let start = notes.map(\.startTime).min() ?? 0
            let duration = max(1, (notes.map(\.endTime).max() ?? 1)-start)
            for note in notes {
                let x = 12 + (note.startTime-start)/duration * (size.width-24)
                let y = 12 + CGFloat(high-note.pitch)/CGFloat(max(1, high-low)) * (size.height-36)
                let width = min(size.width-12-x, max(12, (note.endTime-note.startTime)/duration * (size.width-24)-2))
                context.fill(Path(roundedRect: CGRect(x: x, y: y, width: width, height: 12), cornerRadius: 3), with: .color(ReplayTheme.pitch(note.pitch)))
            }
        }.overlay { if sequence == nil { Image(systemName: "music.note").font(.largeTitle).foregroundStyle(ReplayTheme.muted) } }
        .accessibilityHidden(true)
    }
}

struct ReplayTuneCard: View {
    let tune: TuneLibraryItem
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 0) {
                TuneThumbnail(sequence: tune.sequence).frame(height: 120).opacity(tune.unlocked ? 1 : 0.45)
                VStack(alignment: .leading, spacing: 12) {
                    HStack {
                        Text(tune.unlocked ? "READY TO PLAY" : "LOCKED").font(ReplayTheme.mono())
                            .foregroundStyle(ReplayTheme.muted)
                        Spacer()
                        Image(systemName: tune.unlocked ? "arrow.up.right" : "lock")
                    }
                    Text(tune.title).font(ReplayTheme.display(21)).foregroundStyle(ReplayTheme.ink).lineLimit(2)
                    if !tune.unlocked { Text("Complete \(tune.prerequisites.map(TuneLibraryItem.displayTitle).joined(separator: ", ")) first").font(.caption).foregroundStyle(ReplayTheme.muted) }
                    if let sequence = tune.sequence {
                        Text("\(sequence.notes.count) notes · \(Int(sequence.totalTime.rounded())) sec").font(ReplayTheme.mono()).foregroundStyle(ReplayTheme.muted)
                    }
                }.padding(20).frame(maxWidth: .infinity, alignment: .leading)
            }.background(ReplayTheme.surface).clipShape(RoundedRectangle(cornerRadius: 22))
                .overlay(RoundedRectangle(cornerRadius: 22).stroke(ReplayTheme.border))
        }.buttonStyle(.plain).disabled(!tune.unlocked)
        .accessibilityLabel("\(tune.title), \(tune.unlocked ? "ready to play" : "locked")")
    }
}

struct ReplayFeedbackCard: View {
    let evaluation: String
    let feedback: String
    var reasoning: String? = nil
    var completed = false
    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ReplayStatus(title: completed ? "Tune acquired" : evaluation.capitalized,
                         systemImage: evaluation == "pass" ? "checkmark.seal.fill" : "arrow.counterclockwise",
                         color: evaluation == "pass" ? ReplayTheme.accent : ReplayTheme.warning)
            Text(feedback).fixedSize(horizontal: false, vertical: true)
            if let reasoning, !reasoning.isEmpty { Text(reasoning).font(.caption).foregroundStyle(ReplayTheme.muted) }
        }
    }
}

/// Shared toolbar/rail material. Foreground controls and labels remain unfiltered.
struct PianoDockBackdrop: View {
    @Environment(\.accessibilityReduceTransparency) private var reduceTransparency
    var body: some View {
        ZStack {
            if !reduceTransparency { PianoDockBlur() }
            LinearGradient(colors: [ReplayTheme.surface.opacity(reduceTransparency ? 1 : ReplayTheme.pianoDockTint), ReplayTheme.surface.opacity(reduceTransparency ? 1 : ReplayTheme.pianoDockTint), ReplayTheme.surface], startPoint: .top, endPoint: .bottom)
        }.allowsHitTesting(false).accessibilityHidden(true)
    }
}
private struct PianoDockBlur: UIViewRepresentable {
    func makeUIView(context: Context) -> UIVisualEffectView { UIVisualEffectView(effect: UIBlurEffect(style: .systemThinMaterialDark)) }
    func updateUIView(_ view: UIVisualEffectView, context: Context) {}
}
