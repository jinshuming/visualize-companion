import SwiftUI

struct MessageBubble: View {
    let message: ChatMessage
    private var isUser: Bool { message.role == .user }

    var body: some View {
        Text(message.text)
            .font(DS.Typeface.body)
            .lineSpacing(2)
            .foregroundStyle(isUser ? DS.Palette.userText : DS.Palette.companionText)
            .padding(.horizontal, DS.Size.bubbleHPad)
            .padding(.vertical, DS.Size.bubbleVPad)
            .background(isUser ? DS.Palette.userBubble : DS.Palette.companionBubble,
                        in: .rect(cornerRadius: DS.Size.bubbleRadius))
            .shadow(color: .black.opacity(0.06), radius: 8, y: 3)
            .textSelection(.enabled)
            .transition(.scale(scale: 0.92, anchor: isUser ? .bottomTrailing : .bottomLeading).combined(with: .opacity))
    }
}

struct TypingBubble: View {
    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<3, id: \.self) { i in
                Circle().fill(DS.Palette.companionText.opacity(0.45)).frame(width: 7, height: 7)
                    .phaseAnimator([0.35, 1.0]) { view, phase in view.opacity(phase) }
                        animation: { _ in .easeInOut(duration: 0.5).delay(Double(i) * 0.15) }
            }
        }
        .padding(.horizontal, 18).padding(.vertical, 16)
        .background(DS.Palette.companionBubble, in: .capsule)
    }
}

struct DateSeparator: View {
    let date: Date
    var body: some View {
        Text(date.formatted(.dateTime.year().month(.wide).day().locale(L.current.locale)))
            .font(DS.Typeface.caption)
            .foregroundStyle(.white.opacity(0.92))
            .padding(.horizontal, 14).padding(.vertical, 6)
            .background(DS.Palette.datePillFill, in: .capsule)
            .frame(maxWidth: .infinity)
    }
}
