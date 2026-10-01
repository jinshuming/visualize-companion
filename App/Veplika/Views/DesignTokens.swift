import SwiftUI

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

/// Design tokens. Every value is measured from the reference screenshots
/// (924×2000 px captures of a 393 pt-wide iPhone, i.e. 1 pt ≈ 2.35 px).
enum DS {
    // MARK: Colour
    enum Palette {
        /// Room clear colour while the 3D stage is loading (sampled wall tone).
        static let wall = Color(hex: 0xC9C4D0)
        /// Own message bubble: deep navy (sampled #01004C … #0E0A5E).
        static let userBubble = Color(hex: 0x05004F)
        static let userText = Color.white
        /// Companion bubble: near-white with a violet cast (#FDFCFF), ink text (#232228).
        static let companionBubble = Color(hex: 0xFDFCFF)
        static let companionText = Color(hex: 0x232228)
        /// Frosted control tint over the room: grey-violet (#989BAE bar, #6B6E81 buttons).
        static let glassTint = Color(hex: 0xA9A6BA, opacity: 0.40)
        static let glassTintStrong = Color(hex: 0x6B6E81, opacity: 0.50)
        /// Date separator pill: white wash with white text.
        static let datePillFill = Color.white.opacity(0.34)
        /// Hang-up button (#FB3F02).
        static let hangUp = Color(hex: 0xFB3F02)
        static let onlineGreen = Color(hex: 0x2CB04D)
        static let placeholder = Color.white.opacity(0.5)
        static let icon = Color.white
    }

    // MARK: Metrics (pt)
    enum Size {
        static let topButton: CGFloat = 38          // 80 px circle
        static let namePillHeight: CGFloat = 36     // 78 px
        static let topBarInset: CGFloat = 8         // gap below the safe area
        static let sideMargin: CGFloat = 20
        static let inputHeight: CGFloat = 50        // 118 px
        static let plusButton: CGFloat = 46         // 105 px
        static let bubbleRadius: CGFloat = 26
        static let bubbleHPad: CGFloat = 17
        static let bubbleVPad: CGFloat = 12
        static let messageSpacing: CGFloat = 10
        /// Chat column starts at 28 % of the width so the bust stays visible on the left.
        static let messageLeading: CGFloat = 0.28
        static let messageTrailing: CGFloat = 26
        static let companionMaxWidth: CGFloat = 0.58 // of screen width
        static let callBarHeight: CGFloat = 62       // 146 px
        static let callButton: CGFloat = 48          // 112 px
        static let hangUpButton: CGFloat = 50        // 118 px
        static let callPillHeight: CGFloat = 46      // 108 px
        static let callBarBottom: CGFloat = 52
    }

    // MARK: Type — geometric humanist sans (Avenir Next is the closest system face)
    enum Typeface {
        static let body = Font.custom("AvenirNext-Regular", size: 17)
        static let bodyMedium = Font.custom("AvenirNext-Medium", size: 17)
        static let caption = Font.custom("AvenirNext-Medium", size: 14)
        static let pill = Font.custom("AvenirNext-Medium", size: 16)
        static let wordmark = Font.custom("AvenirNext-DemiBold", size: 20)
    }

    // MARK: Motion
    enum Motion {
        static let spring = Animation.spring(response: 0.42, dampingFraction: 0.82)
        static let glide = Animation.smooth(duration: 0.6)
    }
}

// MARK: - Glass primitives (iOS 26 Liquid Glass, tinted to the reference's grey-violet frost)

extension View {
    func frosted<S: Shape>(_ shape: S, strong: Bool = false, interactive: Bool = false) -> some View {
        let glass = Glass.regular.tint(strong ? DS.Palette.glassTintStrong : DS.Palette.glassTint)
        return self.glassEffect(interactive ? glass.interactive() : glass, in: shape)
    }
}

struct GlassIconButton: View {
    let symbol: String
    var size: CGFloat = DS.Size.topButton
    var tint: Color? = nil
    var strong = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.system(size: size * 0.42, weight: .semibold))
                .foregroundStyle(DS.Palette.icon)
                .frame(width: size, height: size)
        }
        .buttonStyle(.plain)
        .modifier(IconGlass(tint: tint, strong: strong))
        .contentShape(Circle())
    }

    private struct IconGlass: ViewModifier {
        let tint: Color?
        let strong: Bool
        func body(content: Content) -> some View {
            if let tint {
                content.glassEffect(Glass.regular.tint(tint).interactive(), in: .circle)
            } else {
                content.frosted(.circle, strong: strong, interactive: true)
            }
        }
    }
}

struct NamePill: View {
    let name: String
    var chevron = false
    var action: (() -> Void)? = nil

    var body: some View {
        Button { action?() } label: {
            HStack(spacing: 6) {
                Text(name).font(DS.Typeface.pill)
                if chevron { Image(systemName: "chevron.right").font(.system(size: 12, weight: .semibold)).opacity(0.7) }
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 18)
            .frame(height: DS.Size.namePillHeight)
        }
        .buttonStyle(.plain)
        .frosted(.capsule, interactive: action != nil)
    }
}
