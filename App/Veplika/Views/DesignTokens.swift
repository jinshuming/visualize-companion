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
    //
    // The rule: **no saturated colour.** Fills are airy pastels (high brightness, low chroma) or
    // neutrals; colour appears as a translucent tint, never as a solid vivid block. Dark values are
    // allowed only as text ink. `DS.audit()` enforces this at launch in debug builds.

    /// Primitives: the raw ramps. Nothing in the UI references these directly.
    enum Pastel {
        static let lavender = Color(hex: 0xC9C4D0)   // room wall / base neutral-violet
        static let periwinkle = Color(hex: 0xAEB8F0)  // brand
        static let mist = Color(hex: 0xCBD2F6)
        static let sky = Color(hex: 0xBCD6F2)
        static let mint = Color(hex: 0xA8E0D2)
        static let coral = Color(hex: 0xF3AEA2)
        static let peach = Color(hex: 0xF5CDB8)
        static let butter = Color(hex: 0xF4E2B0)
        static let rose = Color(hex: 0xF0C0CC)
        static let lilac = Color(hex: 0xD8B9F0)
        static let ink = Color(hex: 0x2A2740)         // text only
        static let inkSoft = Color(hex: 0x5C5873)     // secondary text only
    }

    /// Semantic tokens: what the UI actually uses.
    enum Palette {
        /// Room clear colour while the 3D stage is loading.
        static let wall = Pastel.lavender
        static let brand = Pastel.periwinkle
        static let ink = Pastel.ink
        static let inkSoft = Pastel.inkSoft

        /// Own bubble: soft periwinkle, ink text. Companion bubble: near-white, ink text.
        static let userBubble = Pastel.mist
        static let userText = Pastel.ink
        static let companionBubble = Color(hex: 0xFDFCFF)
        static let companionText = Pastel.ink

        /// Frosted control tint over the room: cool, light and translucent.
        static let glassTint = Color(hex: 0xB4B2C6, opacity: 0.38)
        static let glassTintStrong = Color(hex: 0x8E8CA6, opacity: 0.42)
        static let datePillFill = Color.white.opacity(0.34)
        static let placeholder = Color.white.opacity(0.55)
        static let icon = Color.white

        /// Hang-up and alerts: a soft coral with dark ink, not a vivid red.
        static let hangUp = Pastel.coral
        static let onHangUp = Color(hex: 0x6B2F2A)
        static let alert = Pastel.coral

        /// Onboarding surfaces (light pastel aurora).
        static let auroraTop = Color(hex: 0xE4E0F7)
        static let auroraMid = Color(hex: 0xD3E3F8)
        static let auroraLow = Color(hex: 0xF7DDE4)
    }

    /// Tokens checked by `audit()`. Ink is exempt because it is text, not a fill.
    private static let audited: [(String, UInt32)] = [
        ("wall", 0xC9C4D0), ("brand", 0xAEB8F0), ("userBubble", 0xCBD2F6), ("companionBubble", 0xFDFCFF),
        ("glassTint", 0xB4B2C6), ("glassTintStrong", 0x8E8CA6), ("hangUp", 0xF3AEA2),
        ("mint", 0xA8E0D2), ("sky", 0xBCD6F2), ("peach", 0xF5CDB8), ("butter", 0xF4E2B0), ("rose", 0xF0C0CC),
        ("lilac", 0xD8B9F0), ("auroraTop", 0xE4E0F7), ("auroraMid", 0xD3E3F8), ("auroraLow", 0xF7DDE4),
    ]

    /// Chroma = saturation × brightness. Pastels sit around 0.2–0.3; a vivid colour is near 1.
    static func chroma(_ hex: UInt32) -> Double {
        let r = Double((hex >> 16) & 0xFF) / 255, g = Double((hex >> 8) & 0xFF) / 255, b = Double(hex & 0xFF) / 255
        return max(r, g, b) - min(r, g, b)
    }
    static let maxChroma = 0.34

    /// Debug-only guard: flags any fill that breaks the "no saturated colour" rule.
    static func audit() {
        #if DEBUG
        let all = audited + Companion.all.flatMap { [("\($0.id).accent", $0.accentHex), ("\($0.id).secondary", $0.secondaryHex)] }
        for (name, hex) in all where chroma(hex) > maxChroma {
            print("⚠️ DS.audit: \(name) #\(String(hex, radix: 16)) chroma \(String(format: "%.2f", chroma(hex))) > \(maxChroma)")
        }
        #endif
    }

    // MARK: Metrics (pt)
    enum Size {
        static let topButton: CGFloat = 38          // 80 px circle
        static let namePillHeight: CGFloat = 36     // 78 px
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

/// Brand wordmark that sits in the status-bar band, centred (the reference shows its logo here).
struct Wordmark: View {
    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "leaf.fill").font(.system(size: 15, weight: .bold))
            Text("Veplika").font(DS.Typeface.wordmark)
        }
        .foregroundStyle(.white.opacity(0.95))
        .shadow(color: .black.opacity(0.12), radius: 4)
    }
}
