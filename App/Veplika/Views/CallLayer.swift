import SwiftUI

/// Voice call: face close-up, live status, frosted control bar with a red hang-up.
struct CallLayer: View {
    @Environment(ChatStore.self) private var store
    @Environment(AvatarController.self) private var avatar
    @Environment(SpeechService.self) private var speech

    let call: CallSession
    let endCall: () -> Void

    @State private var wide = false

    var body: some View {
        VStack(spacing: 0) {
            Button { avatar.nextTheme() } label: {
                Label(L.t("Change call background", "切换通话背景"), systemImage: "photo.on.rectangle.angled")
                    .font(DS.Typeface.pill)
                    .foregroundStyle(.white)
                    .padding(.horizontal, 22)
                    .frame(height: DS.Size.callPillHeight)
            }
            .buttonStyle(.plain)
            .frosted(.capsule, interactive: true)
            .padding(.top, 70)

            VStack(spacing: 2) {
                Text(store.companion.name).font(DS.Typeface.bodyMedium)
                Text(call.phase == .connecting ? call.statusText : "\(call.duration) · \(call.statusText)")
                    .font(DS.Typeface.caption).opacity(0.85)
            }
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.25), radius: 6)
            .padding(.top, 14)

            Spacer(minLength: 0)

            if call.phase == .listening, !call.heard.isEmpty {
                Text(call.heard)
                    .font(DS.Typeface.body)
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .lineLimit(3)
                    .padding(.horizontal, 28).padding(.bottom, 18)
                    .shadow(color: .black.opacity(0.35), radius: 6)
                    .transition(.opacity)
            }

            controls.padding(.bottom, DS.Size.callBarBottom)
        }
        .animation(DS.Motion.spring, value: call.heard.isEmpty)
        .onChange(of: wide) { _, w in avatar.setMode(w ? "chat" : "call") }
    }

    private var controls: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 12) {
                circle(call.loudspeaker ? "speaker.wave.2.fill" : "speaker.fill") { call.setLoudspeaker(!call.loudspeaker) }
                circle(wide ? "video.fill" : "video.slash.fill") { withAnimation { wide.toggle() } }
                circle(call.muted ? "mic.slash.fill" : "mic.fill", highlighted: call.muted) { call.muted.toggle() }
                Button(action: endCall) {
                    Image(systemName: "xmark")
                        .font(.system(size: 20, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: DS.Size.hangUpButton, height: DS.Size.hangUpButton)
                        .background(DS.Palette.hangUp, in: .circle)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 7)
            .frame(height: DS.Size.callBarHeight)
            .frosted(.capsule, strong: false)
        }
    }

    private func circle(_ symbol: String, highlighted: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: 20, weight: .semibold))
                .foregroundStyle(.white)
                .frame(width: DS.Size.callButton, height: DS.Size.callButton)
                .background(highlighted ? DS.Palette.glassTintStrong.opacity(1.4) : DS.Palette.glassTintStrong, in: .circle)
        }
        .buttonStyle(.plain)
    }
}
