import SwiftUI

/// Full-body view of the companion in her room. Drag to orbit 360°, pinch to zoom, double-tap to re-centre.
struct SpaceLayer: View {
    @Environment(ChatStore.self) private var store
    @Environment(AvatarController.self) private var avatar
    @Environment(SpeechService.self) private var speech

    @Binding var mode: AppMode
    @Binding var draft: String
    var focus: FocusState<Bool>.Binding
    @Binding var showSettings: Bool
    let send: () -> Void
    let toggleMic: () -> Void
    let startCall: () -> Void
    let plusMenu: AnyView

    @State private var lastDrag: CGSize = .zero
    @State private var lastMagnification: CGFloat = 1
    @State private var caption: String?
    @State private var captionTask: Task<Void, Never>?
    @State private var showHint = true

    var body: some View {
        ZStack {
            orbitSurface
            VStack(spacing: 0) {
                topBar
                Spacer(minLength: 0)
                if showHint { hint.transition(.opacity.combined(with: .scale(0.95))) }
                if let caption {
                    Text(caption)
                        .font(DS.Typeface.body)
                        .foregroundStyle(DS.Palette.companionText)
                        .padding(.horizontal, DS.Size.bubbleHPad).padding(.vertical, DS.Size.bubbleVPad)
                        .background(DS.Palette.companionBubble, in: .rect(cornerRadius: DS.Size.bubbleRadius))
                        .shadow(color: .black.opacity(0.08), radius: 10, y: 4)
                        .padding(.horizontal, 32).padding(.bottom, 14)
                        .transition(.move(edge: .bottom).combined(with: .opacity))
                }
                InputBar(text: $draft, focus: focus, isListening: speech.isListening,
                         onSend: send, onMic: toggleMic, onCall: startCall, plusMenu: plusMenu)
                    .padding(.horizontal, DS.Size.sideMargin)
                    .padding(.bottom, 8)
            }
        }
        .onAppear {
            Task { try? await Task.sleep(for: .seconds(4)); withAnimation { showHint = false } }
        }
        .onChange(of: store.messages.count) { _, _ in
            guard let last = store.messages.last, last.role == .companion else { return }
            withAnimation(DS.Motion.spring) { caption = last.text }
            captionTask?.cancel()
            captionTask = Task {
                try? await Task.sleep(for: .seconds(7))
                if !Task.isCancelled { withAnimation { caption = nil } }
            }
        }
        .onChange(of: speech.transcript) { _, t in if speech.isListening { draft = t } }
    }

    private var topBar: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                GlassIconButton(symbol: "camera.macro") { avatar.nextTheme() }
                NamePill(name: store.companion.name)
                Spacer(minLength: 0)
                GlassIconButton(symbol: "gearshape.fill") { showSettings = true }
            }
        }
        .padding(.horizontal, DS.Size.sideMargin)
        .padding(.top, 52)
    }

    private var hint: some View {
        Label(L.t("Drag to orbit · Pinch to zoom · Double-tap to reset", "拖动环绕 · 双指缩放 · 双击复位"), systemImage: "rotate.3d")
            .font(DS.Typeface.caption)
            .foregroundStyle(.white)
            .padding(.horizontal, 16).padding(.vertical, 10)
            .frosted(.capsule)
            .padding(.bottom, 14)
    }

    /// Transparent layer that turns touches into camera moves on the web stage.
    private var orbitSurface: some View {
        Color.clear
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 2)
                    .onChanged { v in
                        let dx = v.translation.width - lastDrag.width
                        let dy = v.translation.height - lastDrag.height
                        lastDrag = v.translation
                        avatar.orbit(yaw: Double(dx) * 0.4, pitch: Double(dy) * 0.12)
                        withAnimation { showHint = false }
                    }
                    .onEnded { _ in lastDrag = .zero }
            )
            .simultaneousGesture(
                MagnifyGesture()
                    .onChanged { v in
                        let f = v.magnification / lastMagnification
                        lastMagnification = v.magnification
                        avatar.zoom(Double(f))
                    }
                    .onEnded { _ in lastMagnification = 1 }
            )
            .onTapGesture(count: 2) { avatar.resetOrbit() }
            .onTapGesture { avatar.play(.wave); focus.wrappedValue = false }
    }
}
