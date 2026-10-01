import SwiftUI

enum AppMode {
    case chat, space, call
    var stageName: String {
        switch self { case .chat: "chat"; case .space: "space"; case .call: "call" }
    }
}

struct RootView: View {
    @Environment(ChatStore.self) private var store
    @Environment(AvatarController.self) private var avatar
    @Environment(SpeechService.self) private var speech

    @State private var mode: AppMode = .chat
    @State private var call = CallSession()
    @State private var draft = ""
    @State private var showPicker = false
    @State private var showSettings = false
    @FocusState private var focused: Bool

    var body: some View {
        ZStack {
            DS.Palette.wall.ignoresSafeArea()
            AvatarStageView(controller: avatar).ignoresSafeArea().allowsHitTesting(false)
            bottomShade
            stageStatus

            Group {
                switch mode {
                case .chat:
                    ChatLayer(mode: $mode, draft: $draft, focus: $focused, showPicker: $showPicker,
                              showSettings: $showSettings, send: send, toggleMic: toggleMic, startCall: startCall,
                              plusMenu: plusMenu)
                        .transition(.opacity)
                case .space:
                    SpaceLayer(mode: $mode, draft: $draft, focus: $focused, showSettings: $showSettings,
                               send: send, toggleMic: toggleMic, startCall: startCall, plusMenu: plusMenu)
                        .transition(.opacity)
                case .call:
                    CallLayer(call: call, endCall: endCall)
                        .transition(.opacity)
                }
            }

            VStack { Wordmark().padding(.top, 14); Spacer() }.allowsHitTesting(false)
        }
        .preferredColorScheme(.dark)
        .animation(DS.Motion.glide, value: mode)
        .onAppear {
            avatar.show(store.companion)
            avatar.setMode(mode.stageName)
            store.onReply = { reply in
                if let g = reply.gesture { avatar.play(g) }
                if store.speaksReplies || call.isActive { speech.speak(reply.text, language: store.companion.voiceLanguage) }
            }
        }
        .onChange(of: mode) { _, m in avatar.setMode(m.stageName) }
        .onChange(of: store.companion) { _, new in avatar.show(new) }
        .onChange(of: L.current) { _, _ in store.languageChanged() }
        .onChange(of: focused) { _, f in if f && mode == .space { mode = .chat } }
        .sheet(isPresented: $showPicker) {
            CompanionPickerView(onPicked: { showPicker = false })
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .alert(L.t("Microphone and Speech Access Needed", "需要麦克风与语音识别权限"), isPresented: .init(
            get: { speech.permissionDenied }, set: { speech.permissionDenied = $0 })) {
            Button(L.t("OK", "好的"), role: .cancel) {}
        } message: {
            Text(L.t("Enable them in Settings › Veplika to talk with your companion.", "请在 设置 › Veplika 中开启，才能用语音和伙伴聊天。"))
        }
    }

    // MARK: Pieces

    /// Reference darkens the floor toward the bottom so the white controls stay legible.
    private var bottomShade: some View {
        VStack {
            Spacer()
            LinearGradient(colors: [.clear, Color(hex: 0x4A4150, opacity: 0.38)], startPoint: .top, endPoint: .bottom)
                .frame(height: 260)
        }
        .ignoresSafeArea().allowsHitTesting(false)
    }

    @ViewBuilder private var stageStatus: some View {
        switch avatar.status {
        case .starting, .ready, .loading:
            ProgressView().controlSize(.large).tint(.white)
                .padding(22).frosted(.circle)
        case .failed(let message):
            Text(L.t("Couldn't load the character\n", "角色加载失败\n") + message).font(DS.Typeface.caption).multilineTextAlignment(.center)
                .foregroundStyle(.white).padding(16).frosted(.rect(cornerRadius: 20)).padding(40)
        case .loaded:
            EmptyView()
        }
    }

    private var plusMenu: AnyView {
        AnyView(
            Menu {
                Button { showPicker = true } label: { Label(L.t("Switch companion", "切换伙伴"), systemImage: "person.2.fill") }
                Button { avatar.nextTheme() } label: { Label(L.t("Change room", "切换房间"), systemImage: "camera.macro") }
                Button { avatar.play(.cheer) } label: { Label(L.t("Make them cheer", "让 Ta 欢呼"), systemImage: "party.popper.fill") }
                Divider()
                Button(role: .destructive) { store.clearHistory() } label: { Label(L.t("Clear chat", "清空聊天"), systemImage: "trash") }
            } label: {
                Image(systemName: "plus")
                    .font(.system(size: 20, weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: DS.Size.plusButton, height: DS.Size.plusButton)
                    .frosted(.circle, interactive: true)
            }
        )
    }

    // MARK: Actions

    private func send() {
        let trimmed = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        if speech.isListening { speech.stopListening() }
        speech.stopSpeaking()
        avatar.play(.nod)
        store.send(trimmed)
        draft = ""
    }

    private func toggleMic() {
        Task {
            if speech.isListening {
                let heard = speech.stopListening()
                if !heard.isEmpty { draft = heard; send() }
            } else {
                focused = false
                await speech.startListening(language: store.companion.voiceLanguage)
            }
        }
    }

    private func startCall() {
        focused = false
        speech.stopSpeaking()
        withAnimation(DS.Motion.glide) { mode = .call }
        call.start(store: store, speech: speech, avatar: avatar)
    }

    private func endCall() {
        call.end()
        withAnimation(DS.Motion.glide) { mode = .chat }
    }
}
