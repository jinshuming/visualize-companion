import SwiftUI

enum Gesture: String, Codable {
    case wave, nod, clap, cheer
}

/// A digital human. `id` is the file stem of its PINOC `.vsplat` and thumbnail in `Web/characters`.
struct Companion: Identifiable, Hashable {
    /// Body proportions drive camera framing: chibi heads are big, realistic faces are small.
    enum Style: String { case chibi, realistic }

    let id: String
    let name: String
    private let taglineText: Bilingual
    private let personalityText: Bilingual
    let accent: Color
    let secondary: Color
    private let greetingText: Bilingual
    private let callGreetingText: Bilingual
    var style: Style = .chibi

    var tagline: String { taglineText.text }
    var personality: String { personalityText.text }
    var greeting: String { greetingText.text }
    var callGreeting: String { callGreetingText.text }
    var voiceLanguage: String { L.current.speechLocale }

    static let all: [Companion] = [
        Companion(id: "neko", name: "Neko",
                  taglineText: Bilingual("DJ cat-girl", "DJ 猫系少女"),
                  personalityText: Bilingual("Cool and laid-back, secretly a softie", "酷酷的、懒懒的，其实很会心疼人"),
                  accent: Color(red: 0.86, green: 0.45, blue: 0.95), secondary: Color(red: 0.35, green: 0.30, blue: 0.85),
                  greetingText: Bilingual("Hey, you made it. Want some music, or just a chat?", "哟，你来啦。今天想听点什么，还是想聊点什么？"),
                  callGreetingText: Bilingual("Hey. I'm here. Go ahead, I'm listening.", "喂，我在。说吧，我听着。")),
        Companion(id: "mint", name: "Mina",
                  taglineText: Bilingual("A gentle mint-colored friend", "薄荷色的温柔陪伴"),
                  personalityText: Bilingual("Gentle, thoughtful, a wonderful listener", "温柔、细腻，善于倾听"),
                  accent: Color(red: 0.35, green: 0.85, blue: 0.75), secondary: Color(red: 0.25, green: 0.55, blue: 0.85),
                  greetingText: Bilingual("Hi there~ I'm Mina. How was your day? Take your time, I'm listening.", "你好呀～我是 Mina。今天过得怎么样？慢慢说，我在听。"),
                  callGreetingText: Bilingual("Hello~ I picked up! Take your time, I'm listening.", "喂～我接到啦，你慢慢说，我在听。")),
        Companion(id: "drummer", name: "Riko",
                  taglineText: Bilingual("Energetic drummer", "元气鼓手"),
                  personalityText: Bilingual("Warm, direct, always cheering you on", "热情、直率，永远在给你打气"),
                  accent: Color(red: 1.0, green: 0.55, blue: 0.40), secondary: Color(red: 0.95, green: 0.25, blue: 0.45),
                  greetingText: Bilingual("Heyyy! Finally! Got anything fun to share today?", "嗨嗨！终于等到你了！今天有什么好玩的事要分享给我吗？"),
                  callGreetingText: Bilingual("Hello hello! I'm here! Talk to me!", "喂喂喂！我在我在！快说快说！")),
        Companion(id: "explorer", name: "Leo",
                  taglineText: Bilingual("Sunny explorer", "阳光探险家"),
                  personalityText: Bilingual("Curious, upbeat, full of adventure ideas", "好奇、乐观，满脑子冒险点子"),
                  accent: Color(red: 1.0, green: 0.78, blue: 0.30), secondary: Color(red: 0.30, green: 0.70, blue: 0.45),
                  greetingText: Bilingual("Hey, partner! Ready for today's adventure? Tell me how you're feeling first.", "嘿，伙伴！准备好今天的冒险了吗？先跟我说说你的心情吧。"),
                  callGreetingText: Bilingual("Hey, partner! Line's clear. Go ahead, report in.", "喂，伙伴！线路畅通，开始汇报吧。")),
        Companion(id: "blonde", name: "Chloe",
                  taglineText: Bilingual("Poised blonde", "优雅金发女生"),
                  personalityText: Bilingual("Poised, witty and warm underneath", "从容、机智，内心很温暖"),
                  accent: Color(red: 0.98, green: 0.78, blue: 0.52), secondary: Color(red: 0.93, green: 0.50, blue: 0.62),
                  greetingText: Bilingual("Hello, you. Perfect timing, I was hoping you'd stop by. How are you, really?", "你好呀。来得正好，我正希望你能来。说真的，你今天怎么样？"),
                  callGreetingText: Bilingual("Hello, you. I'm all ears.", "喂，是你呀。我听着呢。"),
                  style: .realistic),
        Companion(id: "cowgirl", name: "Jolene",
                  taglineText: Bilingual("Western cowgirl", "西部牛仔女孩"),
                  personalityText: Bilingual("Bold, free-spirited, tells tall tales", "洒脱、不羁，爱讲夸张的故事"),
                  accent: Color(red: 0.93, green: 0.62, blue: 0.30), secondary: Color(red: 0.72, green: 0.36, blue: 0.25),
                  greetingText: Bilingual("Well howdy, partner! Pull up a chair. What brings you to town?", "嗨，伙计！快坐。什么风把你吹到镇上来了？"),
                  callGreetingText: Bilingual("Howdy! Line's open, talk to me.", "嗨！线路通着呢，说吧。"),
                  style: .realistic),
        Companion(id: "selfie", name: "Sam",
                  taglineText: Bilingual("Close-up selfie buddy", "自拍特写小伙伴"),
                  personalityText: Bilingual("Chatty, playful, always up for a selfie", "话多、爱玩，随时来张自拍"),
                  accent: Color(red: 0.40, green: 0.70, blue: 0.95), secondary: Color(red: 0.55, green: 0.45, blue: 0.90),
                  greetingText: Bilingual("Oh hey! You're in my frame. Say hi, then tell me everything.", "哦嘿！你入镜啦。先打个招呼，然后把一切都告诉我。"),
                  callGreetingText: Bilingual("Hey hey! Can you see me? I can see you!", "嘿嘿！你看得到我吗？我看得到你！"),
                  style: .realistic),
    ]

    static func find(_ id: String) -> Companion { all.first { $0.id == id } ?? all[0] }

    var thumbnail: UIImage? {
        guard let url = Bundle.main.url(forResource: "Web", withExtension: nil)?
            .appendingPathComponent("characters/\(id).webp") else { return nil }
        return UIImage(contentsOfFile: url.path)
    }
}
