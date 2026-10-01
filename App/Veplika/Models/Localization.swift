import Foundation
import Observation

enum Language: String, CaseIterable, Identifiable {
    case en, zh
    var id: String { rawValue }
    /// Shown in its own language so it's findable whichever one is active.
    var label: String { self == .en ? "English" : "中文" }
    var locale: Locale { Locale(identifier: self == .en ? "en_US" : "zh_Hans_CN") }
    /// Locale for speech recognition and synthesis.
    var speechLocale: String { self == .en ? "en-US" : "zh-CN" }
}

/// In-app language, independent of the device language. Defaults to English.
/// Not main-actor isolated so models and the chat engine can read it too.
@Observable
final class LanguageStore: @unchecked Sendable {
    static let shared = LanguageStore()
    private static let key = "language"

    var current: Language {
        didSet { UserDefaults.standard.set(current.rawValue, forKey: Self.key) }
    }

    private init() {
        current = Language(rawValue: UserDefaults.standard.string(forKey: Self.key) ?? "") ?? .en
    }

    /// Pick the string for the active language. Reading `current` registers the dependency,
    /// so any SwiftUI view calling this re-renders when the language changes.
    func t(_ en: String, _ zh: String) -> String { current == .zh ? zh : en }
}

/// Short alias used throughout the UI: `L.t("Hello", "你好")`.
let L = LanguageStore.shared

/// A string that exists in both languages.
struct Bilingual: Hashable {
    let en: String
    let zh: String
    init(_ en: String, _ zh: String) { self.en = en; self.zh = zh }
    var text: String { L.t(en, zh) }
}
