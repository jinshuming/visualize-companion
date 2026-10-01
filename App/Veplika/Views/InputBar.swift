import SwiftUI

/// "+" circle, frosted message pill with mic and phone — the shared bottom bar of chat and space views.
struct InputBar: View {
    @Binding var text: String
    var focus: FocusState<Bool>.Binding
    let isListening: Bool
    let onSend: () -> Void
    let onMic: () -> Void
    let onCall: () -> Void
    let plusMenu: AnyView

    var body: some View {
        GlassEffectContainer(spacing: 10) {
            HStack(spacing: 10) {
                plusMenu
                HStack(spacing: 8) {
                    TextField("", text: $text, prompt: Text(L.t("Your message", "说点什么…")).foregroundColor(DS.Palette.placeholder), axis: .vertical)
                        .font(DS.Typeface.body)
                        .foregroundStyle(.white)
                        .tint(.white)
                        .lineLimit(1...4)
                        .focused(focus)
                        .submitLabel(.send)
                        .onSubmit(onSend)
                    if text.trimmingCharacters(in: .whitespaces).isEmpty {
                        Button(action: onMic) {
                            Image(systemName: isListening ? "waveform" : "mic.fill")
                                .symbolEffect(.variableColor.iterative, isActive: isListening)
                                .font(.system(size: 19, weight: .semibold))
                                .foregroundStyle(isListening ? Color(hex: 0xFF6B4A) : .white)
                                .frame(width: 30, height: 30)
                        }
                        Button(action: onCall) {
                            Image(systemName: "phone.fill")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(.white)
                                .frame(width: 30, height: 30)
                        }
                    } else {
                        Button(action: onSend) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 30))
                                .foregroundStyle(.white)
                        }
                    }
                }
                .buttonStyle(.plain)
                .padding(.leading, 18).padding(.trailing, 10)
                .frame(minHeight: DS.Size.inputHeight)
                .frosted(.rect(cornerRadius: DS.Size.inputHeight / 2), interactive: true)
            }
        }
    }
}
