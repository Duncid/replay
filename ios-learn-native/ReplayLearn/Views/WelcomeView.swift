import SwiftUI

struct WelcomeView: View {
    @EnvironmentObject private var model: LessonViewModel
    @Binding var search: String
    @State private var filter = "All"
    private var filtered: [TuneLibraryItem] {
        model.tunes.filter { tune in
            (search.isEmpty || tune.title.localizedCaseInsensitiveContains(search)) &&
            (filter == "All" || (filter == "Ready" && tune.unlocked && !tune.acquired) || (filter == "Acquired" && tune.acquired) || (filter == "Locked" && !tune.unlocked))
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                HStack(alignment: .firstTextBaseline) {
                    Text("Your tunes").font(ReplayTheme.display(44))
                    Spacer()
                    Text("\(model.tunes.count) IN LIBRARY").font(ReplayTheme.mono()).foregroundStyle(ReplayTheme.muted)
                }
                if let resume = model.resume, model.tunes.contains(where: { $0.tuneKey == resume.tuneKey && $0.unlocked }), search.isEmpty {
                    resumeCard(resume)
                }
                HStack {
                    Text("THE LIBRARY").font(ReplayTheme.mono()).foregroundStyle(ReplayTheme.muted)
                    Spacer()
                    Picker("Filter tunes", selection: $filter) { ForEach(["All", "Ready", "Acquired", "Locked"], id: \.self) { Text($0) } }.pickerStyle(.menu)
                }
                if filtered.isEmpty {
                    ContentUnavailableView(search.isEmpty ? "No tunes here yet" : "No matching tunes", systemImage: "music.note.list", description: Text(search.isEmpty ? "Published tunes will appear here. Pull down to refresh." : "Try a different name or filter."))
                } else {
                    LazyVGrid(columns: [GridItem(.adaptive(minimum: 240, maximum: 420), spacing: 18, alignment: .top)], alignment: .leading, spacing: 18) {
                        ForEach(filtered) { tune in ReplayTuneCard(tune: tune) { model.startTune(tune.tuneKey) } }
                    }
                }
            }.padding(32).frame(maxWidth: 1500).frame(maxWidth: .infinity)
        }.background(ReplayTheme.background)
        .refreshable { await model.loadLibrary() }
    }
    private func resumeCard(_ resume: PracticeResume) -> some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 28) {
                TuneThumbnail(sequence: resume.plan.first?.sequence).frame(width: 180, height: 116).clipShape(RoundedRectangle(cornerRadius: 12))
                resumeDetails(resume)
                Button { model.startTune(resume.tuneKey) } label: { Label("Resume", systemImage: "play.fill") }.buttonStyle(ReplayButtonStyle())
            }
            VStack(alignment: .leading, spacing: 20) {
                resumeDetails(resume)
                Button { model.startTune(resume.tuneKey) } label: { Label("Resume", systemImage: "play.fill") }.buttonStyle(ReplayButtonStyle())
            }
        }.padding(26).background(ReplayTheme.surface, in: RoundedRectangle(cornerRadius: 26))
        .overlay(RoundedRectangle(cornerRadius: 26).stroke(ReplayTheme.accent.opacity(0.45)))
    }
    private func resumeDetails(_ resume: PracticeResume) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("CONTINUE PRACTICING").font(ReplayTheme.mono()).foregroundStyle(ReplayTheme.accent)
            Text(resume.title).font(ReplayTheme.display(26))
            Text("Section \(resume.index+1) of \(resume.plan.count)").font(.subheadline).foregroundStyle(ReplayTheme.muted)
            ProgressView(value: Double(resume.index), total: Double(max(1,resume.plan.count))).tint(ReplayTheme.accent)
                .accessibilityLabel("Sections reached")
        }.frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct ProgressLibraryView: View {
    @EnvironmentObject private var model: LessonViewModel
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                Text("Every note counts.").font(ReplayTheme.display(40))
                Text("Your practice on this iPad.").foregroundStyle(ReplayTheme.muted)
                HStack(spacing: 18) {
                    metric("TUNES ACQUIRED", value: model.tunes.filter(\.acquired).count)
                    metric("EVALUATED ATTEMPTS", value: model.attempts.count)
                }
                Text("RECENT PRACTICE").font(ReplayTheme.mono()).foregroundStyle(ReplayTheme.muted)
                if model.attempts.isEmpty {
                    ContentUnavailableView("Your progress starts here", systemImage: "waveform.path", description: Text("Record an attempt in Tunes. Your coach’s result will appear here."))
                } else {
                    ForEach(model.attempts) { attempt in
                        ReplayCard {
                            HStack {
                                VStack(alignment: .leading, spacing: 8) {
                                    Text(TuneLibraryItem.displayTitle(attempt.tuneKey)).font(.headline)
                                    Text(attempt.date, format: .dateTime.month().day().hour().minute()).font(.caption).foregroundStyle(ReplayTheme.muted)
                                }
                                Spacer()
                                Text(attempt.result.capitalized).foregroundStyle(attempt.result == "pass" ? ReplayTheme.accent : ReplayTheme.warning)
                            }
                        }
                    }
                }
            }.padding(32).frame(maxWidth: 1100).frame(maxWidth: .infinity)
        }.background(ReplayTheme.background)
    }
    private func metric(_ label: String, value: Int) -> some View {
        ReplayCard { VStack(alignment: .leading, spacing: 12) { Text("\(value)").font(ReplayTheme.display(44)).foregroundStyle(ReplayTheme.accent); Text(label).font(ReplayTheme.mono()).foregroundStyle(ReplayTheme.muted) } }
    }
}
