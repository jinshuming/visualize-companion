import SwiftUI

struct SettingsView: View {
    @Environment(ChatStore.self) private var store
    @Environment(SpeechService.self) private var speech
    @Environment(\.dismiss) private var dismiss
    @Environment(AvatarController.self) private var avatar
    @AppStorage("diagnostics") private var diagnostics = false
    @State private var confirmClear = false

    var body: some View {
        @Bindable var store = store
        @Bindable var lang = LanguageStore.shared
        NavigationStack {
            List {
                Section(L.t("Language", "语言")) {
                    Picker(L.t("Language", "语言"), selection: $lang.current) {
                        ForEach(Language.allCases) { Text($0.label).tag($0) }
                    }
                    .pickerStyle(.segmented)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets())
                }
                Section(L.t("Voice", "语音")) {
                    Toggle(L.t("Read replies aloud", "朗读伙伴的回复"), isOn: $store.speaksReplies)
                        .onChange(of: store.speaksReplies) { _, on in if !on { speech.stopSpeaking() } }
                }
                Section(L.t("Relationship", "关系")) {
                    LabeledContent(L.t("Companion", "当前伙伴"), value: store.companion.name)
                    LabeledContent(L.t("Intimacy level", "亲密等级"), value: "Lv.\(store.level)")
                    Button(L.t("Clear chat with \(store.companion.name)", "清空与 \(store.companion.name) 的聊天"), role: .destructive) {
                        confirmClear = true
                    }
                }
                Section(L.t("About", "关于")) {
                    LabeledContent(L.t("Chat engine", "对话引擎"), value: L.t("Local mock", "本地 Mock"))
                    LabeledContent(L.t("Character rendering", "角色渲染"), value: "PINOC · Gaussian Splat")
                    Toggle(L.t("Show render diagnostics", "显示渲染诊断"), isOn: $diagnostics)
                        .onChange(of: diagnostics) { _, on in avatar.setDebug(on) }
                }
            }
            .navigationTitle(L.t("Settings", "设置"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button(L.t("Done", "完成")) { dismiss() } } }
            .confirmationDialog(L.t("Clear the chat history and intimacy level?", "确定清空聊天记录和亲密度吗？"),
                                isPresented: $confirmClear, titleVisibility: .visible) {
                Button(L.t("Clear", "清空"), role: .destructive) { store.clearHistory() }
            }
        }
    }
}
