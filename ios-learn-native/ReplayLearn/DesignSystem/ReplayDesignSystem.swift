import SwiftUI

/// Native tokens stay independent of the web implementation. Use semantic roles
/// so components adapt to accessibility settings and the current color scheme.
enum ReplayTheme {
    static let background = Color(uiColor: .systemBackground)
    static let surface = Color(uiColor: .secondarySystemBackground)
    static let border = Color(uiColor: .separator)
    static let accent = Color(hue: 45 / 360, saturation: 0.95, brightness: 0.98)
    static let onAccent = Color.black
    static let success = Color.green
    static let warning = Color.orange
    static let destructive = Color.red
    static let radius: CGFloat = 12
    static let controlHeight: CGFloat = 44

    enum Space {
        static let tiny: CGFloat = 4
        static let small: CGFloat = 8
        static let medium: CGFloat = 16
        static let large: CGFloat = 24
        static let page: CGFloat = 32
    }
}

struct ReplayCard<Content: View>: View {
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(ReplayTheme.Space.medium)
            .background(ReplayTheme.surface, in: RoundedRectangle(cornerRadius: ReplayTheme.radius))
    }
}

struct ReplayButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary, destructive }
    var kind: Kind = .primary
    @Environment(\.isEnabled) private var isEnabled

    private var background: Color {
        switch kind {
        case .primary: return ReplayTheme.accent
        case .secondary: return ReplayTheme.surface
        case .destructive: return ReplayTheme.destructive
        }
    }
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .padding(.horizontal, ReplayTheme.Space.medium)
            .padding(.vertical, ReplayTheme.Space.small)
            .frame(minHeight: ReplayTheme.controlHeight)
            .foregroundStyle(kind == .primary ? ReplayTheme.onAccent : kind == .destructive ? .white : .primary)
            .background(background.opacity(configuration.isPressed ? 0.75 : 1), in: RoundedRectangle(cornerRadius: ReplayTheme.radius))
            .opacity(isEnabled ? 1 : 0.45)
    }
}

struct ReplayStatus: View {
    let title: String
    let systemImage: String
    var color: Color = .secondary
    var font: Font = .subheadline
    var body: some View {
        Label(title, systemImage: systemImage)
            .font(font)
            .foregroundStyle(color)
            .fixedSize(horizontal: false, vertical: true)
    }
}

struct ReplayTuneCard: View {
    let title: String
    let unlocked: Bool
    var prerequisites: [String] = []
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            ReplayCard {
                HStack(spacing: ReplayTheme.Space.medium) {
                    Image(systemName: unlocked ? "music.note" : "lock.fill")
                        .font(.title2).foregroundStyle(unlocked ? ReplayTheme.accent : .secondary)
                    VStack(alignment: .leading, spacing: ReplayTheme.Space.small) {
                        Text(title).font(.headline)
                        Text(unlocked ? "Unlocked" : "Locked · Complete \(prerequisites.joined(separator: ", "))")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                    if unlocked { Image(systemName: "arrow.right") }
                }
                .frame(minHeight: 88)
            }
        }
        .buttonStyle(.plain)
        .disabled(!unlocked)
        .accessibilityLabel("\(unlocked ? "Practice" : "Locked"): \(title)")
        .accessibilityHint(unlocked ? "Open tune practice" : "Complete \(prerequisites.joined(separator: ", ")) first")
    }
}

struct ReplayFeedbackCard: View {
    let evaluation: String
    let feedback: String
    var reasoning: String? = nil
    var completed = false

    private var color: Color {
        switch evaluation {
        case "pass": return ReplayTheme.success
        case "close": return ReplayTheme.warning
        default: return ReplayTheme.destructive
        }
    }
    private var icon: String {
        switch evaluation {
        case "pass": return "checkmark.circle.fill"
        case "close": return "circle.lefthalf.filled"
        default: return "xmark.circle.fill"
        }
    }
    var body: some View {
        ReplayCard {
            VStack(alignment: .leading, spacing: ReplayTheme.Space.medium) {
                ReplayStatus(title: evaluation.capitalized, systemImage: icon, color: color)
                Text(feedback).fixedSize(horizontal: false, vertical: true)
                if let reasoning, !reasoning.isEmpty {
                    Text(reasoning).font(.caption).foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if completed {
                    ReplayStatus(title: "Tune completed", systemImage: "checkmark.seal.fill", color: ReplayTheme.success)
                }
            }
        }
    }
}
