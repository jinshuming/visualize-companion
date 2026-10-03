import Foundation
import Observation

@MainActor
@Observable
final class ChatStore {
    private(set) var companion: Companion
    private(set) var messages: [ChatMessage] = []
    private(set) var isTyping = false
    private(set) var xp = 0

    var speaksReplies = true
    /// Called when the companion answers; the stage uses it to play a gesture and the speaker to read it aloud.
    var onReply: ((Reply) -> Void)?

    private let engine: ChatEngine
    private var task: Task<Void, Never>?

    init(engine: ChatEngine = MockChatEngine()) {
        self.engine = engine
        let id = UserDefaults.standard.string(forKey: "companion") ?? Companion.all[0].id
        self.companion = Companion.find(id)
        load()
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("-seedDemo") { seedDemo() }
        #endif
    }

    #if DEBUG
    /// Launch with `-seedDemo` to preview a populated conversation without typing.
    private func seedDemo() {
        let day: TimeInterval = 86_400
        let now = Date()
        messages = [
            ChatMessage(role: .companion, text: L.t("Hey, I've missed you! What have you been up to?", "嘿，好久不见！这段时间你都在忙些什么呀？"), date: now - 3 * day),
            ChatMessage(role: .user, text: L.t("Hello", "你好"), date: now - 3 * day),
            ChatMessage(role: .companion, text: L.t("Long day, huh? How was your Monday so far?", "今天辛苦了吧？周一过得怎么样？"), date: now - 3 * day),
            ChatMessage(role: .user, text: L.t("Who are you?", "你是谁呀"), date: now - 3 * day),
            ChatMessage(role: .companion, text: L.t("Your friend, created just for you. We've known each other for a while now, remember?", "我是专门为你创造的朋友，我们已经认识一阵子啦，还记得吗？"), date: now - 3 * day),
            ChatMessage(role: .companion, text: L.t("Hii~ how are you today?", "嗨～今天过得怎么样呀？"), date: now),
            ChatMessage(role: .user, text: L.t("A bit tired, but really happy!", "今天有点累，但是很开心！"), date: now),
            ChatMessage(role: .companion, text: L.t("Sounds like a full day. Tell me, what made you so happy?", "听起来很充实呢。快跟我讲讲，是什么让你这么开心？"), date: now),
        ]
    }
    #endif

    // MARK: Levelling (Replika-style relationship progress)

    static let xpPerLevel = 50
    var level: Int { xp / Self.xpPerLevel + 1 }

    // MARK: Actions

    func select(_ new: Companion) {
        guard new != companion else { return }
        task?.cancel()
        isTyping = false
        save()
        companion = new
        UserDefaults.standard.set(new.id, forKey: "companion")
        load()
    }

    func send(_ raw: String) {
        let text = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        messages.append(ChatMessage(role: .user, text: text))
        xp += 2
        save()

        let target = companion
        let history = messages
        task?.cancel()
        isTyping = true
        task = Task { [engine] in
            do {
                let reply = try await engine.reply(to: text, history: history, companion: target, language: L.current)
                guard !Task.isCancelled, target == companion else { return }
                isTyping = false
                messages.append(ChatMessage(role: .companion, text: reply.text))
                xp += 3
                save()
                onReply?(reply)
            } catch {
                if !Task.isCancelled { isTyping = false }
            }
        }
    }

    /// If the chat is still just the opening line, restate it in the newly chosen language.
    func languageChanged() {
        if messages.count == 1, messages[0].role == .companion { seedGreeting(); save() }
    }

    /// Persist a new display name and refresh anything showing it.
    func rename(_ name: String) {
        CompanionNames.set(name, for: companion.id)
        companion = Companion.find(companion.id)
        languageChanged()
    }

    func clearHistory() {
        task?.cancel()
        isTyping = false
        messages = []
        xp = 0
        seedGreeting()
        save()
    }

    // MARK: Persistence

    private struct Snapshot: Codable { var messages: [ChatMessage]; var xp: Int }

    private var fileURL: URL {
        let dir = URL.applicationSupportDirectory
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("chat-\(companion.id).json")
    }

    private func load() {
        if let data = try? Data(contentsOf: fileURL), let snap = try? JSONDecoder().decode(Snapshot.self, from: data) {
            messages = snap.messages
            xp = snap.xp
        } else {
            messages = []
            xp = 0
        }
        if messages.isEmpty { seedGreeting() }
    }

    private func seedGreeting() {
        messages = [ChatMessage(role: .companion, text: companion.greeting)]
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(Snapshot(messages: messages, xp: xp)) else { return }
        try? data.write(to: fileURL, options: .atomic)
    }
}
