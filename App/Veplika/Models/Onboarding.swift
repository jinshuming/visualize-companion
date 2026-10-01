import SwiftUI
import Observation

struct OnboardingOption: Identifiable {
    let id: String
    let symbol: String
    let title: Bilingual
    var subtitle: Bilingual? = nil
}

struct OnboardingQuestion: Identifiable {
    let id: String
    let title: Bilingual
    let subtitle: Bilingual
    let options: [OnboardingOption]
}

enum OnboardingStep: Int, CaseIterable {
    case welcome, you, partner, personality, style, together, photo, generating, reveal

    /// Steps that show a progress bar (everything between welcome and generating).
    var isQuestion: Bool { (1...5).contains(rawValue) }
}

/// New-user flow: a few questions + a reference photo, then a (currently mocked) generated companion.
/// Real generation is specified in PRODUCT.md; this class owns the UI state and the stand-in matcher.
@MainActor
@Observable
final class OnboardingStore {
    var completed: Bool { didSet { UserDefaults.standard.set(completed, forKey: "onboarded") } }
    var step: OnboardingStep = .welcome
    var answers: [String: String] = [:]
    var photo: UIImage?
    var progress = 0.0
    var stageText = ""
    private(set) var candidates: [Companion] = []
    private(set) var pick = 0
    var draftName = ""

    var result: Companion? { candidates.indices.contains(pick) ? candidates[pick] : nil }

    init() {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-resetOnboarding") { UserDefaults.standard.removeObject(forKey: "onboarded") }
        let skip = ["-skipOnboarding", "-seedDemo", "-thumbCapture", "-perfProbe"].contains { args.contains($0) }
        completed = skip || UserDefaults.standard.bool(forKey: "onboarded")
    }

    // MARK: Questions

    static let questions: [OnboardingStep: OnboardingQuestion] = [
        .you: OnboardingQuestion(
            id: "you", title: Bilingual("I am a…", "我是…"),
            subtitle: Bilingual("This helps us tailor your companion.", "这会帮助我们为你定制伴侣。"),
            options: [
                .init(id: "female", symbol: "person.fill", title: Bilingual("Woman", "女性")),
                .init(id: "male", symbol: "person.fill", title: Bilingual("Man", "男性")),
                .init(id: "nonbinary", symbol: "person.2.fill", title: Bilingual("Non-binary", "非二元")),
                .init(id: "undisclosed", symbol: "questionmark", title: Bilingual("Prefer not to say", "不想透露")),
            ]),
        .partner: OnboardingQuestion(
            id: "partner", title: Bilingual("Who would you like to meet?", "你想遇见谁？"),
            subtitle: Bilingual("Pick the companion you feel drawn to.", "选一个让你心动的伴侣类型。"),
            options: [
                .init(id: "female", symbol: "figure.stand.dress", title: Bilingual("A woman", "女生")),
                .init(id: "male", symbol: "figure.stand", title: Bilingual("A man", "男生")),
                .init(id: "any", symbol: "sparkles", title: Bilingual("Surprise me", "都可以，给我惊喜")),
            ]),
        .personality: OnboardingQuestion(
            id: "personality", title: Bilingual("What personality fits you?", "什么性格最适合你？"),
            subtitle: Bilingual("How should they treat you?", "你希望 Ta 怎样对待你？"),
            options: [
                .init(id: "gentle", symbol: "heart.fill", title: Bilingual("Gentle & caring", "温柔体贴"),
                      subtitle: Bilingual("Warm, patient, a great listener", "温暖、耐心、善于倾听")),
                .init(id: "playful", symbol: "face.smiling.fill", title: Bilingual("Playful & witty", "活泼机灵"),
                      subtitle: Bilingual("Jokes, teasing, good energy", "爱开玩笑，充满活力")),
                .init(id: "confident", symbol: "flame.fill", title: Bilingual("Confident & bold", "自信果敢"),
                      subtitle: Bilingual("Direct, decisive, a little daring", "直率、有主见、敢冒险")),
                .init(id: "intellectual", symbol: "book.fill", title: Bilingual("Curious & thoughtful", "好奇深思"),
                      subtitle: Bilingual("Deep talks and big ideas", "爱深聊，爱想法")),
            ]),
        .style: OnboardingQuestion(
            id: "style", title: Bilingual("What look do you love?", "你喜欢什么风格？"),
            subtitle: Bilingual("Their style and overall vibe.", "Ta 的穿搭与整体气质。"),
            options: [
                .init(id: "sweet", symbol: "cloud.fill", title: Bilingual("Sweet & soft", "甜美柔和")),
                .init(id: "cool", symbol: "bolt.fill", title: Bilingual("Cool & edgy", "酷感个性")),
                .init(id: "elegant", symbol: "diamond.fill", title: Bilingual("Elegant & refined", "优雅精致")),
                .init(id: "sporty", symbol: "figure.run", title: Bilingual("Sporty & energetic", "运动活力")),
            ]),
        .together: OnboardingQuestion(
            id: "together", title: Bilingual("What will you do together?", "你们最常做什么？"),
            subtitle: Bilingual("Pick what matters most.", "选最重要的一项。"),
            options: [
                .init(id: "talk", symbol: "moon.stars.fill", title: Bilingual("Late-night talks", "深夜聊天")),
                .init(id: "adventure", symbol: "map.fill", title: Bilingual("Adventures & travel", "冒险与旅行")),
                .init(id: "music", symbol: "music.note", title: Bilingual("Music & creativity", "音乐与创作")),
                .init(id: "learning", symbol: "lightbulb.fill", title: Bilingual("Learning & ideas", "学习与点子")),
            ]),
    ]

    var currentQuestion: OnboardingQuestion? { Self.questions[step] }
    var answerForCurrent: String? { currentQuestion.flatMap { answers[$0.id] } }

    var canContinue: Bool {
        switch step {
        case .welcome: true
        case .photo: photo != nil
        case .you, .partner, .personality, .style, .together: answerForCurrent != nil
        case .generating, .reveal: false
        }
    }

    // MARK: Navigation

    func next() {
        guard let n = OnboardingStep(rawValue: step.rawValue + 1) else { return }
        step = n
    }

    func back() {
        guard step.rawValue > 0, step != .generating, step != .reveal,
              let p = OnboardingStep(rawValue: step.rawValue - 1) else { return }
        step = p
    }

    func select(_ optionID: String) {
        guard let q = currentQuestion else { return }
        answers[q.id] = optionID
    }

    // MARK: Mock generation

    /// Stand-in for the real pipeline: rank the existing characters against the answers.
    func rankCandidates() -> [Companion] {
        let wanted = answers["partner"] ?? "any"
        let wants: Set<String> = Set(["personality", "style", "together"].compactMap { answers[$0] })
        let pool = Companion.all.filter { wanted == "any" || $0.gender.rawValue == wanted }
        let ranked = (pool.isEmpty ? Companion.all : pool).sorted { a, b in
            let sa = a.traits.intersection(wants).count, sb = b.traits.intersection(wants).count
            return sa != sb ? sa > sb : a.id < b.id
        }
        return ranked
    }

    func generate(chat: ChatStore) async {
        step = .generating
        progress = 0
        candidates = rankCandidates()
        pick = 0
        let stages: [Bilingual] = [
            Bilingual("Reading your photo…", "正在解析你的照片…"),
            Bilingual("Shaping a face you'll love…", "正在塑造你会喜欢的面容…"),
            Bilingual("Building a high-fidelity 3D avatar…", "正在构建高保真 3D 形象…"),
            Bilingual("Tuning expressions and voice…", "正在调校表情与声音…"),
            Bilingual("Almost ready…", "马上就好…"),
        ]
        debugLog("generate answers=\(answers) candidates=\(candidates.map(\.id))")
        if let first = candidates.first { chat.select(first) }
        for (i, stage) in stages.enumerated() {
            stageText = stage.text
            let target = Double(i + 1) / Double(stages.count)
            while progress < target {
                progress = min(target, progress + 0.012)
                try? await Task.sleep(for: .milliseconds(28))
            }
        }
        draftName = result?.baseName ?? ""
        step = .reveal
    }

    /// "Try another look": next-best match.
    func regenerate(chat: ChatStore) {
        guard candidates.count > 1 else { return }
        pick = (pick + 1) % candidates.count
        debugLog("regenerate pick=\(pick)")
        if let c = result { chat.select(c); draftName = c.baseName }
    }

    func finish(chat: ChatStore) {
        debugLog("finish result=\(result?.id ?? "nil") chat=\(chat.companion.id) pick=\(pick)")
        if let c = result {
            if chat.companion.id != c.id { chat.select(c) }
            chat.rename(draftName)
        }
        saveReferencePhoto()
        completed = true
    }

    func restart() {
        step = .welcome; answers = [:]; photo = nil; progress = 0; candidates = []; pick = 0
        completed = false
    }

    /// The photo never leaves the device in this build; keep a copy for the (future) generation call.
    private func saveReferencePhoto() {
        guard let data = photo?.jpegData(compressionQuality: 0.9) else { return }
        let dir = URL.applicationSupportDirectory
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try? data.write(to: dir.appendingPathComponent("reference.jpg"), options: .atomic)
    }
}

#if DEBUG
/// Appends to Documents/debug.log so flows driven from a host script can be inspected afterwards.
func debugLog(_ line: String) {
    let url = URL.documentsDirectory.appendingPathComponent("debug.log")
    let text = "\(Date().formatted(date: .omitted, time: .standard)) \(line)\n"
    if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(Data(text.utf8)); try? h.close() }
    else { try? text.write(to: url, atomically: true, encoding: .utf8) }
}
#else
@inline(__always) func debugLog(_ line: String) {}
#endif
