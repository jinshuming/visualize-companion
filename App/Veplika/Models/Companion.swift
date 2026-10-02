import SwiftUI

enum Gesture: String, Codable {
    case wave, nod, clap, cheer
}

/// A digital human. `id` is the file stem of its PINOC `.vsplat` and thumbnail in `Web/characters`.
struct Companion: Identifiable, Hashable {
    /// Body proportions drive camera framing: chibi heads are big, realistic faces are small.
    enum Style: String { case chibi, realistic }

    let id: String
    let baseName: String
    private let taglineText: Bilingual
    private let personalityText: Bilingual
    let accent: Color
    let secondary: Color
    private let greetingText: Bilingual
    private let callGreetingText: Bilingual
    var style: Style = .chibi

    /// The user may rename their companion during onboarding.
    var name: String { CompanionNames.name(for: id) ?? baseName }
    /// Hex mirrors of the accents, used by `DS.audit()`.
    var accentHex: UInt32 { Self.hexTable[id]?.0 ?? 0 }
    var secondaryHex: UInt32 { Self.hexTable[id]?.1 ?? 0 }
    var gender: Gender { Self.tagTable[id]?.gender ?? .female }
    var traits: Set<String> { Self.tagTable[id]?.traits ?? [] }
    /// Onboarding visual-style bucket: `realistic`, `stylized` (none in the library yet) or `cartoon`.
    var visualStyle: String { style == .realistic ? "realistic" : "cartoon" }
    var tagline: String { taglineText.text }
    var personality: String { personalityText.text }
    var greeting: String { greetingText.text }
    var callGreeting: String { callGreetingText.text }
    var voiceLanguage: String { L.current.speechLocale }

    static let all: [Companion] = [
        Companion(id: "neko", baseName: "Neko",
                  taglineText: Bilingual("DJ cat-girl", "DJ 猫系少女"),
                  personalityText: Bilingual("Cool and laid-back, secretly a softie", "酷酷的、懒懒的，其实很会心疼人"),
                  accent: Color(hex: 0xD8B9F0), secondary: Color(hex: 0xB9C4F2),
                  greetingText: Bilingual("Hey, you made it. Want some music, or just a chat?", "哟，你来啦。今天想听点什么，还是想聊点什么？"),
                  callGreetingText: Bilingual("Hey. I'm here. Go ahead, I'm listening.", "喂，我在。说吧，我听着。")),
        Companion(id: "mint", baseName: "Mina",
                  taglineText: Bilingual("A gentle mint-colored friend", "薄荷色的温柔陪伴"),
                  personalityText: Bilingual("Gentle, thoughtful, a wonderful listener", "温柔、细腻，善于倾听"),
                  accent: Color(hex: 0xA8E0D2), secondary: Color(hex: 0xB6D4F0),
                  greetingText: Bilingual("Hi there~ I'm Mina. How was your day? Take your time, I'm listening.", "你好呀～我是 Mina。今天过得怎么样？慢慢说，我在听。"),
                  callGreetingText: Bilingual("Hello~ I picked up! Take your time, I'm listening.", "喂～我接到啦，你慢慢说，我在听。")),
        Companion(id: "drummer", baseName: "Riko",
                  taglineText: Bilingual("Energetic drummer", "元气鼓手"),
                  personalityText: Bilingual("Warm, direct, always cheering you on", "热情、直率，永远在给你打气"),
                  accent: Color(hex: 0xF5C4B0), secondary: Color(hex: 0xF2BCCB),
                  greetingText: Bilingual("Heyyy! Finally! Got anything fun to share today?", "嗨嗨！终于等到你了！今天有什么好玩的事要分享给我吗？"),
                  callGreetingText: Bilingual("Hello hello! I'm here! Talk to me!", "喂喂喂！我在我在！快说快说！")),
        Companion(id: "explorer", baseName: "Leo",
                  taglineText: Bilingual("Sunny explorer", "阳光探险家"),
                  personalityText: Bilingual("Curious, upbeat, full of adventure ideas", "好奇、乐观，满脑子冒险点子"),
                  accent: Color(hex: 0xF4E2B0), secondary: Color(hex: 0xBFE3C6),
                  greetingText: Bilingual("Hey, partner! Ready for today's adventure? Tell me how you're feeling first.", "嘿，伙伴！准备好今天的冒险了吗？先跟我说说你的心情吧。"),
                  callGreetingText: Bilingual("Hey, partner! Line's clear. Go ahead, report in.", "喂，伙伴！线路畅通，开始汇报吧。")),
        Companion(id: "blonde", baseName: "Chloe",
                  taglineText: Bilingual("Poised blonde", "优雅金发女生"),
                  personalityText: Bilingual("Poised, witty and warm underneath", "从容、机智，内心很温暖"),
                  accent: Color(hex: 0xF2D8B6), secondary: Color(hex: 0xEDBFC8),
                  greetingText: Bilingual("Hello, you. Perfect timing, I was hoping you'd stop by. How are you, really?", "你好呀。来得正好，我正希望你能来。说真的，你今天怎么样？"),
                  callGreetingText: Bilingual("Hello, you. I'm all ears.", "喂，是你呀。我听着呢。"),
                  style: .realistic),
        Companion(id: "cowgirl", baseName: "Jolene",
                  taglineText: Bilingual("Western cowgirl", "西部牛仔女孩"),
                  personalityText: Bilingual("Bold, free-spirited, tells tall tales", "洒脱、不羁，爱讲夸张的故事"),
                  accent: Color(hex: 0xEBC9A6), secondary: Color(hex: 0xE3B8AA),
                  greetingText: Bilingual("Well howdy, partner! Pull up a chair. What brings you to town?", "嗨，伙计！快坐。什么风把你吹到镇上来了？"),
                  callGreetingText: Bilingual("Howdy! Line's open, talk to me.", "嗨！线路通着呢，说吧。"),
                  style: .realistic),
        Companion(id: "selfie", baseName: "Sam",
                  taglineText: Bilingual("Close-up selfie buddy", "自拍特写小伙伴"),
                  personalityText: Bilingual("Chatty, playful, always up for a selfie", "话多、爱玩，随时来张自拍"),
                  accent: Color(hex: 0xB8D6F4), secondary: Color(hex: 0xCDC3F0),
                  greetingText: Bilingual("Oh hey! You're in my frame. Say hi, then tell me everything.", "哦嘿！你入镜啦。先打个招呼，然后把一切都告诉我。"),
                  callGreetingText: Bilingual("Hey hey! Can you see me? I can see you!", "嘿嘿！你看得到我吗？我看得到你！"),
                  style: .realistic),
    ]

    enum Gender: String { case female, male }

    private static let hexTable: [String: (UInt32, UInt32)] = [
        "neko": (0xD8B9F0, 0xB9C4F2),
        "mint": (0xA8E0D2, 0xB6D4F0),
        "drummer": (0xF5C4B0, 0xF2BCCB),
        "explorer": (0xF4E2B0, 0xBFE3C6),
        "blonde": (0xF2D8B6, 0xEDBFC8),
        "cowgirl": (0xEBC9A6, 0xE3B8AA),
        "selfie": (0xB8D6F4, 0xCDC3F0),
    ]

    /// What each character is like (personality, look, activity, music genres); used by the (mock) onboarding matcher.
    static let tagTable: [String: (gender: Gender, traits: Set<String>)] = [
        "neko": (.female, ["cool", "playful", "music", "electronic", "lofi", "hiphop"]),
        "mint": (.female, ["gentle", "sweet", "talk", "lofi", "folk", "classical"]),
        "drummer": (.female, ["playful", "sporty", "music", "rock", "pop", "kpop"]),
        "explorer": (.male, ["playful", "sporty", "adventure", "confident", "indie", "folk", "rock"]),
        "blonde": (.female, ["elegant", "intellectual", "confident", "talk", "learning", "jazz", "classical"]),
        "cowgirl": (.female, ["confident", "cool", "adventure", "country", "folk"]),
        "selfie": (.female, ["playful", "sweet", "talk", "pop", "kpop", "soundtrack"]),
    ]

    static func find(_ id: String) -> Companion { all.first { $0.id == id } ?? all[0] }

    var thumbnail: UIImage? {
        guard let url = Bundle.main.url(forResource: "Web", withExtension: nil)?
            .appendingPathComponent("characters/\(id).webp") else { return nil }
        return UIImage(contentsOfFile: url.path)
    }
}

/// User-chosen names, stored per character id.
enum CompanionNames {
    private static let key = "companionNames"
    static func name(for id: String) -> String? {
        (UserDefaults.standard.dictionary(forKey: key) as? [String: String])?[id]
    }
    static func set(_ name: String, for id: String) {
        var all = (UserDefaults.standard.dictionary(forKey: key) as? [String: String]) ?? [:]
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { all[id] = nil } else { all[id] = trimmed }
        UserDefaults.standard.set(all, forKey: key)
    }
}
