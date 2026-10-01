import SwiftUI

struct ChatLayer: View {
    @Environment(ChatStore.self) private var store
    @Environment(AvatarController.self) private var avatar
    @Environment(SpeechService.self) private var speech

    @Binding var mode: AppMode
    @Binding var draft: String
    var focus: FocusState<Bool>.Binding
    @Binding var showPicker: Bool
    @Binding var showSettings: Bool
    let send: () -> Void
    let toggleMic: () -> Void
    let startCall: () -> Void
    let plusMenu: AnyView

    private enum Row: Identifiable {
        case date(Date), message(ChatMessage)
        var id: String {
            switch self {
            case .date(let d): "d-\(d.timeIntervalSince1970)"
            case .message(let m): m.id.uuidString
            }
        }
    }

    private var rows: [Row] {
        var out: [Row] = []
        var day: Date?
        for m in store.messages {
            let d = Calendar.current.startOfDay(for: m.date)
            if d != day { out.append(.date(d)); day = d }
            out.append(.message(m))
        }
        return out
    }

    var body: some View {
        GeometryReader { geo in
            VStack(spacing: 0) {
                topBar
                messages(width: geo.size.width)
                InputBar(text: $draft, focus: focus, isListening: speech.isListening,
                         onSend: send, onMic: toggleMic, onCall: startCall, plusMenu: plusMenu)
                    .padding(.horizontal, DS.Size.sideMargin)
                    .padding(.bottom, 8)
            }
        }
        .onChange(of: speech.transcript) { _, t in if speech.isListening { draft = t } }
    }

    private var topBar: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                GlassIconButton(symbol: "house.fill") { showPicker = true }
                NamePill(name: store.companion.name, chevron: true) { showSettings = true }
                Spacer(minLength: 0)
                GlassIconButton(symbol: "bubble.left.fill") { withAnimation(DS.Motion.glide) { mode = .space } }
                Menu {
                    Button { avatar.play(.wave) } label: { Label(L.t("Wave", "挥手"), systemImage: "hand.wave.fill") }
                    Button { avatar.play(.nod) } label: { Label(L.t("Nod", "点头"), systemImage: "arrow.up.and.down") }
                    Button { avatar.play(.clap) } label: { Label(L.t("Clap", "鼓掌"), systemImage: "hands.clap.fill") }
                    Button { avatar.play(.cheer) } label: { Label(L.t("Cheer", "欢呼"), systemImage: "party.popper.fill") }
                } label: {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: DS.Size.topButton * 0.42, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(width: DS.Size.topButton, height: DS.Size.topButton)
                        .frosted(.circle, interactive: true)
                }
            }
        }
        .padding(.horizontal, DS.Size.sideMargin)
        .padding(.top, 52)
        .padding(.bottom, 6)
    }

    private func messages(width: CGFloat) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: DS.Size.messageSpacing) {
                    ForEach(rows) { row in
                        switch row {
                        case .date(let d):
                            DateSeparator(date: d).padding(.vertical, 6)
                        case .message(let m):
                            MessageBubble(message: m)
                                .frame(maxWidth: width * (m.role == .user ? 0.62 : DS.Size.companionMaxWidth),
                                       alignment: m.role == .user ? .trailing : .leading)
                                .frame(maxWidth: .infinity, alignment: m.role == .user ? .trailing : .leading)
                        }
                    }
                    if store.isTyping { TypingBubble().id("typing") }
                    Color.clear.frame(height: 6).id("end")
                }
                .padding(.leading, width * DS.Size.messageLeading)
                .padding(.trailing, DS.Size.messageTrailing)
                .padding(.top, 24)
            }
            .scrollIndicators(.hidden)
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .mask(LinearGradient(stops: [.init(color: .clear, location: 0), .init(color: .black, location: 0.07),
                                         .init(color: .black, location: 0.97), .init(color: .clear, location: 1)],
                                 startPoint: .top, endPoint: .bottom))
            .onChange(of: store.messages.count) { _, _ in scrollToEnd(proxy) }
            .onChange(of: store.isTyping) { _, _ in scrollToEnd(proxy) }
            .onChange(of: mode) { _, _ in scrollToEnd(proxy, animated: false) }
        }
    }

    private func scrollToEnd(_ proxy: ScrollViewProxy, animated: Bool = true) {
        let go = { proxy.scrollTo("end", anchor: .bottom) }
        if animated { withAnimation(DS.Motion.spring, go) } else { go() }
    }
}
