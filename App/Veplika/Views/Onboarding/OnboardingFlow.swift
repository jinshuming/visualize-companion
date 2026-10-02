import SwiftUI
import PhotosUI

/// New-user flow: welcome → five questions → music taste → reference photo → visual style → (mock) generation
/// → meet your companion.
/// Light pastel surfaces with ink text; the 3D stage shows through only on the reveal.
struct OnboardingFlow: View {
    @Environment(OnboardingStore.self) private var ob
    @Environment(ChatStore.self) private var chat
    @Environment(AvatarController.self) private var avatar
    @Environment(SpeechService.self) private var speech

    var body: some View {
        ZStack {
            if ob.step != .reveal {
                AuroraBackdrop().transition(.opacity)
            }
            Group {
                switch ob.step {
                case .welcome: WelcomeStep()
                case .you, .partner, .personality, .style, .together: QuestionStep()
                case .music: MusicStep()
                case .photo: PhotoStep()
                case .visual: VisualStyleStep()
                case .generating: GeneratingStep()
                case .reveal: RevealStep()
                }
            }
            .id(ob.step)
            .transition(.opacity.combined(with: .offset(x: 28)))
        }
        .environment(\.colorScheme, .light)
        .tint(DS.Palette.brand)
        .animation(.smooth(duration: 0.38), value: ob.step)
        .onChange(of: ob.step) { _, s in
            if s == .reveal { avatar.setMode("space") }
        }
    }
}

// MARK: - Backdrop

/// Slowly drifting pastel mesh: lavender, mist blue and blush.
struct AuroraBackdrop: View {
    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20)) { ctx in
            let t = Float(ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 600))
            MeshGradient(width: 3, height: 3, points: [
                [0, 0], [0.5, 0], [1, 0],
                [0, 0.5], [0.5 + 0.14 * sin(t * 0.35), 0.5 + 0.12 * cos(t * 0.28)], [1, 0.5],
                [0, 1], [0.5, 1], [1, 1],
            ], colors: [
                DS.Palette.auroraTop, DS.Palette.auroraMid, DS.Palette.auroraLow,
                DS.Palette.auroraMid, .white, DS.Palette.auroraTop,
                DS.Palette.auroraLow, DS.Palette.auroraTop, DS.Palette.auroraMid,
            ])
        }
        .ignoresSafeArea()
    }
}

// MARK: - Shared chrome

private struct StepScaffold<Content: View>: View {
    @Environment(OnboardingStore.self) private var ob
    var showsProgress = true
    var ctaTitle: String
    var ctaEnabled: Bool
    var onCTA: () -> Void
    @ViewBuilder var content: Content

    var body: some View {
        VStack(spacing: 0) {
            header
            content.frame(maxHeight: .infinity)
            Button(action: onCTA) {
                Text(ctaTitle)
                    .font(DS.Typeface.bodyMedium)
                    .foregroundStyle(DS.Palette.ink)
                    .frame(maxWidth: .infinity).frame(height: 30)
            }
            .buttonStyle(.glassProminent)
            .tint(DS.Palette.brand)
            .controlSize(.large)
            .disabled(!ctaEnabled)
            .padding(.horizontal, DS.Size.sideMargin)
            .padding(.bottom, 14)
        }
    }

    private var header: some View {
        HStack(spacing: 14) {
            Button { ob.back() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(DS.Palette.ink)
                    .frame(width: DS.Size.topButton, height: DS.Size.topButton)
                    .glassEffect(.regular.interactive(), in: .circle)
            }
            .buttonStyle(.plain)
            .opacity(ob.step == .welcome ? 0 : 1)
            .disabled(ob.step == .welcome)

            if showsProgress {
                ProgressDots(current: ob.step.rawValue - 1, total: OnboardingStep.progressSteps)
            } else {
                Spacer()
            }
            Color.clear.frame(width: DS.Size.topButton, height: DS.Size.topButton)
        }
        .padding(.horizontal, DS.Size.sideMargin)
        .padding(.top, 14)
        .padding(.bottom, 6)
    }
}

private struct ProgressDots: View {
    let current: Int
    let total: Int
    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<total, id: \.self) { i in
                Capsule()
                    .fill(i <= current ? DS.Palette.brand : DS.Palette.ink.opacity(0.12))
                    .frame(width: i == current ? 26 : 8, height: 8)
            }
        }
        .frame(maxWidth: .infinity)
        .animation(DS.Motion.spring, value: current)
    }
}

// MARK: - Steps

private struct WelcomeStep: View {
    @Environment(OnboardingStore.self) private var ob

    var body: some View {
        StepScaffold(showsProgress: false, ctaTitle: L.t("Create my companion", "创建我的伴侣"),
                     ctaEnabled: true, onCTA: { ob.next() }) {
            VStack(spacing: 18) {
                Spacer()
                Image(systemName: "sparkles")
                    .font(.system(size: 34, weight: .medium))
                    .foregroundStyle(DS.Palette.ink.opacity(0.7))
                    .frame(width: 84, height: 84)
                    .glassEffect(.regular.tint(DS.Palette.brand.opacity(0.4)), in: .circle)
                Text(L.t("Meet someone made for you", "遇见专属于你的 Ta"))
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(DS.Palette.ink)
                    .multilineTextAlignment(.center)
                Text(L.t("Answer a few questions and share a photo. We'll shape a companion with a look, a voice and a personality that fits you.",
                         "回答几个问题，再上传一张照片，我们会为你塑造一位外貌、声音与性格都合拍的伴侣。"))
                    .font(DS.Typeface.body)
                    .foregroundStyle(DS.Palette.inkSoft)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 36)
                Spacer()
                Spacer()
            }
        }
    }
}

private struct QuestionStep: View {
    @Environment(OnboardingStore.self) private var ob

    var body: some View {
        if let q = ob.currentQuestion {
            StepScaffold(ctaTitle: L.t("Continue", "继续"), ctaEnabled: ob.canContinue, onCTA: { ob.next() }) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(q.title.text)
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .foregroundStyle(DS.Palette.ink)
                        Text(q.subtitle.text)
                            .font(DS.Typeface.body)
                            .foregroundStyle(DS.Palette.inkSoft)
                            .padding(.bottom, 14)
                        GlassEffectContainer(spacing: 12) {
                            VStack(spacing: 12) {
                                ForEach(q.options) { opt in
                                    OptionCard(option: opt, selected: ob.answerForCurrent == opt.id) {
                                        withAnimation(DS.Motion.spring) { ob.select(opt.id) }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, DS.Size.sideMargin)
                    .padding(.top, 10)
                }
                .scrollIndicators(.hidden)
            }
        }
    }
}

private struct OptionCard: View {
    let option: OnboardingOption
    let selected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: option.symbol)
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(DS.Palette.ink.opacity(0.75))
                    .frame(width: 42, height: 42)
                    .background(DS.Palette.brand.opacity(selected ? 0.55 : 0.25), in: .circle)
                VStack(alignment: .leading, spacing: 2) {
                    Text(option.title.text).font(DS.Typeface.bodyMedium).foregroundStyle(DS.Palette.ink)
                    if let sub = option.subtitle {
                        Text(sub.text).font(DS.Typeface.caption).foregroundStyle(DS.Palette.inkSoft)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(selected ? DS.Palette.ink.opacity(0.65) : DS.Palette.ink.opacity(0.2))
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
            .contentShape(.rect(cornerRadius: 24))
        }
        .buttonStyle(.plain)
        .glassEffect(selected ? .regular.tint(DS.Palette.brand.opacity(0.35)).interactive() : .regular.interactive(),
                     in: .rect(cornerRadius: 24))
    }
}

private struct PhotoStep: View {
    @Environment(OnboardingStore.self) private var ob
    @Environment(ChatStore.self) private var chat
    @State private var item: PhotosPickerItem?

    var body: some View {
        @Bindable var ob = ob
        StepScaffold(ctaTitle: L.t("Continue", "继续"), ctaEnabled: ob.canContinue, onCTA: { ob.next() }) {
            VStack(spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text(L.t("Add a reference photo", "上传一张参考照片"))
                        .font(.system(size: 30, weight: .bold, design: .rounded)).foregroundStyle(DS.Palette.ink)
                    Text(L.t("A clear, front-facing photo works best. It's used only to shape your companion and stays on your device in this preview.",
                             "清晰的正面照效果最好。照片仅用于塑造你的伴侣，此预览版中不会离开你的设备。"))
                        .font(DS.Typeface.body).foregroundStyle(DS.Palette.inkSoft)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, DS.Size.sideMargin).padding(.top, 10)

                Spacer(minLength: 0)
                PhotosPicker(selection: $item, matching: .images) {
                    ZStack {
                        if let img = ob.photo {
                            Image(uiImage: img).resizable().scaledToFill()
                        } else {
                            VStack(spacing: 10) {
                                Image(systemName: "photo.badge.plus").font(.system(size: 40, weight: .light))
                                Text(L.t("Choose a photo", "选择照片")).font(DS.Typeface.bodyMedium)
                            }
                            .foregroundStyle(DS.Palette.ink.opacity(0.65))
                        }
                    }
                    .frame(width: 250, height: 320)
                    .clipShape(.rect(cornerRadius: 36))
                    .glassEffect(.regular.tint(DS.Palette.brand.opacity(0.18)).interactive(), in: .rect(cornerRadius: 36))
                }
                .buttonStyle(.plain)
                Button { ob.photo = Companion.all.randomElement()?.thumbnail } label: {
                    Text(L.t("Use a sample photo", "使用示例照片")).font(DS.Typeface.caption)
                        .foregroundStyle(DS.Palette.inkSoft).underline()
                }
                Spacer(minLength: 0)
            }
        }
        .onChange(of: item) { _, new in
            Task {
                if let data = try? await new?.loadTransferable(type: Data.self), let img = UIImage(data: data) {
                    ob.photo = img
                }
            }
        }
    }
}

// MARK: - Music taste (multi-select, playful)

/// A sticker-wall of genres: tap to toggle, tiles bounce and pop a note, the vibe meter dances harder
/// the more you pick, and a reaction line answers each choice. "Shuffle for me" helps the undecided.
private struct MusicStep: View {
    @Environment(OnboardingStore.self) private var ob
    @State private var shuffles = 0
    private let columns = Array(repeating: GridItem(.flexible(), spacing: 10), count: 3)

    var body: some View {
        StepScaffold(ctaTitle: ob.music.isEmpty ? L.t("Pick at least one", "至少选一个")
                                                 : L.t("Continue (\(ob.music.count))", "继续（\(ob.music.count)）"),
                     ctaEnabled: ob.canContinue, onCTA: { ob.next() }) {
            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    Text(L.t("What's on your playlist?", "你的歌单里都有什么？"))
                        .font(.system(size: 30, weight: .bold, design: .rounded))
                        .foregroundStyle(DS.Palette.ink)
                    Text(L.t("Pick as many as you like. They'll share your taste.", "想选几个就选几个，Ta 会和你品味相投。"))
                        .font(DS.Typeface.body)
                        .foregroundStyle(DS.Palette.inkSoft)

                    VibeMeter(tints: OnboardingStore.musicGenres.filter { ob.music.contains($0.id) }.map(\.tint))
                        .frame(height: 44)
                        .padding(.top, 10)
                    Text(ob.musicReaction)
                        .font(DS.Typeface.caption)
                        .foregroundStyle(DS.Palette.inkSoft)
                        .frame(maxWidth: .infinity)
                        .contentTransition(.opacity)
                        .animation(.easeInOut(duration: 0.25), value: ob.musicReaction)
                        .padding(.bottom, 8)

                    LazyVGrid(columns: columns, spacing: 10) {
                        ForEach(Array(OnboardingStore.musicGenres.enumerated()), id: \.element.id) { i, g in
                            MusicTile(genre: g, index: i, selected: ob.music.contains(g.id)) {
                                withAnimation(DS.Motion.spring) { ob.toggleMusic(g.id) }
                            }
                        }
                    }

                    Button {
                        shuffles += 1
                        withAnimation(DS.Motion.spring) { ob.shuffleMusic() }
                    } label: {
                        Label(L.t("Shuffle for me", "帮我随机选"), systemImage: "shuffle")
                            .font(DS.Typeface.caption).foregroundStyle(DS.Palette.ink)
                            .symbolEffect(.bounce, value: shuffles)
                            .padding(.horizontal, 16).frame(height: 38)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.interactive(), in: .capsule)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 8)
                    .sensoryFeedback(.impact(weight: .light), trigger: shuffles)
                }
                .padding(.horizontal, DS.Size.sideMargin)
                .padding(.top, 10)
                .padding(.bottom, 12)
            }
            .scrollIndicators(.hidden)
        }
    }
}

private struct MusicTile: View {
    let genre: MusicGenre
    let index: Int
    let selected: Bool
    let action: () -> Void
    @State private var pops = 0

    /// Selected tiles tilt a little, like stickers slapped on a wall.
    private var tilt: Double { selected ? [-4, 3, -2, 4, -3, 2][index % 6] : 0 }

    var body: some View {
        Button {
            if !selected { pops += 1 }
            action()
        } label: {
            VStack(spacing: 8) {
                Image(systemName: genre.symbol)
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(DS.Palette.ink.opacity(selected ? 0.8 : 0.6))
                    .symbolEffect(.bounce, value: pops)
                    .frame(width: 46, height: 46)
                    .background(genre.tint.opacity(selected ? 0.75 : 0.35), in: .circle)
                Text(genre.title.text)
                    .font(DS.Typeface.caption)
                    .foregroundStyle(DS.Palette.ink)
                    .multilineTextAlignment(.center)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, minHeight: 104)
            .padding(.horizontal, 6)
            .contentShape(.rect(cornerRadius: 22))
            .overlay(alignment: .topTrailing) {
                if selected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundStyle(DS.Palette.ink.opacity(0.55))
                        .padding(8)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .overlay { FloatingNote(trigger: pops) }
        }
        .buttonStyle(.plain)
        .glassEffect(selected ? .regular.tint(genre.tint.opacity(0.45)).interactive() : .regular.interactive(),
                     in: .rect(cornerRadius: 22))
        .scaleEffect(selected ? 1.04 : 1)
        .rotationEffect(.degrees(tilt))
        .sensoryFeedback(.selection, trigger: selected)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

/// A little note that floats up and fades each time a tile is picked.
private struct FloatingNote: View {
    let trigger: Int

    private struct FX { var y: CGFloat = 0; var opacity: Double = 0; var scale: CGFloat = 0.6 }

    var body: some View {
        Image(systemName: "music.note")
            .font(.system(size: 18, weight: .bold))
            .foregroundStyle(DS.Palette.ink.opacity(0.45))
            .keyframeAnimator(initialValue: FX(), trigger: trigger) { view, fx in
                view.offset(y: fx.y).opacity(fx.opacity).scaleEffect(fx.scale)
            } keyframes: { _ in
                KeyframeTrack(\.y) { LinearKeyframe(-58, duration: 0.8) }
                KeyframeTrack(\.opacity) {
                    LinearKeyframe(1, duration: 0.1)
                    LinearKeyframe(1, duration: 0.3)
                    LinearKeyframe(0, duration: 0.4)
                }
                KeyframeTrack(\.scale) {
                    SpringKeyframe(1.1, duration: 0.4)
                    LinearKeyframe(0.9, duration: 0.4)
                }
            }
            .allowsHitTesting(false)
    }
}

/// Equalizer bars that idle gently and dance harder as the playlist grows, tinted by the picked genres.
private struct VibeMeter: View {
    let tints: [Color]
    private let bars = 17

    var body: some View {
        let energy = min(1, Double(tints.count) / 4)
        TimelineView(.animation(minimumInterval: 1 / 30)) { ctx in
            let t = ctx.date.timeIntervalSinceReferenceDate
            HStack(alignment: .center, spacing: 5) {
                ForEach(0..<bars, id: \.self) { i in
                    let wave = abs(sin(t * (2.2 + Double(i % 5) * 0.55) + Double(i) * 0.9))
                    let h = 0.14 + (0.08 + 0.78 * energy) * wave
                    Capsule()
                        .fill(tints.isEmpty ? DS.Palette.ink.opacity(0.12) : tints[i % tints.count].opacity(0.85))
                        .frame(width: 6)
                        .frame(maxHeight: .infinity)
                        .scaleEffect(x: 1, y: h, anchor: .center)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .animation(.smooth(duration: 0.5), value: tints.count)
        .accessibilityHidden(true)
    }
}

// MARK: - Visual style (the last choice before generation)

private struct VisualStyleStep: View {
    @Environment(OnboardingStore.self) private var ob
    @Environment(ChatStore.self) private var chat

    var body: some View {
        if let q = ob.currentQuestion {
            StepScaffold(ctaTitle: L.t("Create my companion", "生成我的伴侣"), ctaEnabled: ob.canContinue,
                         onCTA: { Task { await ob.generate(chat: chat) } }) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(q.title.text)
                            .font(.system(size: 30, weight: .bold, design: .rounded))
                            .foregroundStyle(DS.Palette.ink)
                        Text(q.subtitle.text)
                            .font(DS.Typeface.body)
                            .foregroundStyle(DS.Palette.inkSoft)
                            .padding(.bottom, 14)
                        GlassEffectContainer(spacing: 14) {
                            VStack(spacing: 14) {
                                ForEach(q.options) { opt in
                                    VisualStyleCard(option: opt, selected: ob.answerForCurrent == opt.id) {
                                        withAnimation(DS.Motion.spring) { ob.select(opt.id) }
                                    }
                                }
                            }
                        }
                    }
                    .padding(.horizontal, DS.Size.sideMargin)
                    .padding(.top, 10)
                }
                .scrollIndicators(.hidden)
            }
        }
    }
}

private struct VisualStyleCard: View {
    let option: OnboardingOption
    let selected: Bool
    let action: () -> Void

    /// Library characters that show the style. "Stylized CG" has none yet, so it shows its symbol only.
    private var samples: [UIImage] {
        Companion.all.filter { $0.visualStyle == option.id }.prefix(3).compactMap(\.thumbnail)
    }

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                preview
                VStack(alignment: .leading, spacing: 3) {
                    Text(option.title.text)
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(DS.Palette.ink)
                    if let sub = option.subtitle {
                        Text(sub.text).font(DS.Typeface.caption).foregroundStyle(DS.Palette.inkSoft)
                    }
                }
                Spacer(minLength: 0)
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(selected ? DS.Palette.ink.opacity(0.65) : DS.Palette.ink.opacity(0.2))
                    .symbolEffect(.bounce, value: selected)
            }
            .padding(14)
            .contentShape(.rect(cornerRadius: 28))
        }
        .buttonStyle(.plain)
        .glassEffect(selected ? .regular.tint(DS.Palette.brand.opacity(0.35)).interactive() : .regular.interactive(),
                     in: .rect(cornerRadius: 28))
        .scaleEffect(selected ? 1.02 : 1)
        .sensoryFeedback(.selection, trigger: selected)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    /// Overlapping portrait chips of matching characters, or the style's symbol.
    @ViewBuilder private var preview: some View {
        if samples.isEmpty {
            Image(systemName: option.symbol)
                .font(.system(size: 28, weight: .medium))
                .foregroundStyle(DS.Palette.ink.opacity(0.7))
                .symbolEffect(.bounce, value: selected)
                .frame(width: 84, height: 84)
                .background(DS.Palette.brand.opacity(selected ? 0.55 : 0.25), in: .rect(cornerRadius: 22))
        } else {
            ZStack {
                ForEach(Array(samples.enumerated()), id: \.offset) { i, img in
                    Image(uiImage: img).resizable().scaledToFill()
                        .frame(width: 56, height: 72)
                        .clipShape(.rect(cornerRadius: 16))
                        .overlay(RoundedRectangle(cornerRadius: 16).stroke(.white.opacity(0.8), lineWidth: 2))
                        .rotationEffect(.degrees(selected ? Double(i - 1) * 9 : Double(i - 1) * 4))
                        .offset(x: CGFloat(i - 1) * (selected ? 14 : 10))
                }
            }
            .frame(width: 84, height: 84)
        }
    }
}

private struct GeneratingStep: View {
    @Environment(OnboardingStore.self) private var ob
    @State private var sweep = false

    var body: some View {
        VStack(spacing: 26) {
            Spacer()
            ZStack {
                if let img = ob.photo {
                    Image(uiImage: img).resizable().scaledToFill()
                        .frame(width: 190, height: 190).clipShape(.circle)
                        .overlay {
                            // soft scanning sweep
                            LinearGradient(colors: [.clear, .white.opacity(0.55), .clear], startPoint: .top, endPoint: .bottom)
                                .frame(height: 70).offset(y: sweep ? 100 : -100).clipShape(.circle)
                        }
                }
                Circle().stroke(DS.Palette.ink.opacity(0.08), lineWidth: 6).frame(width: 230, height: 230)
                Circle().trim(from: 0, to: ob.progress)
                    .stroke(DS.Palette.brand, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .rotationEffect(.degrees(-90)).frame(width: 230, height: 230)
            }
            .glassEffect(.regular.tint(DS.Palette.brand.opacity(0.12)), in: .circle)
            .onAppear { withAnimation(.easeInOut(duration: 1.6).repeatForever(autoreverses: true)) { sweep = true } }

            VStack(spacing: 6) {
                Text(L.t("Creating your companion", "正在创建你的伴侣"))
                    .font(.system(size: 26, weight: .bold, design: .rounded)).foregroundStyle(DS.Palette.ink)
                Text(ob.stageText).font(DS.Typeface.body).foregroundStyle(DS.Palette.inkSoft)
                    .contentTransition(.opacity).animation(.easeInOut, value: ob.stageText)
            }
            Spacer(); Spacer()
        }
    }
}

private struct RevealStep: View {
    @Environment(OnboardingStore.self) private var ob
    @Environment(ChatStore.self) private var chat
    @FocusState private var nameFocused: Bool

    var body: some View {
        @Bindable var ob = ob
        VStack {
            Spacer()
            VStack(spacing: 14) {
                Text(L.t("Meet your companion", "认识你的伴侣"))
                    .font(DS.Typeface.caption).foregroundStyle(DS.Palette.inkSoft)
                    .textCase(.uppercase).tracking(1.2)
                TextField(L.t("Give them a name", "给 Ta 起个名字"), text: $ob.draftName)
                    .font(.system(size: 30, weight: .bold, design: .rounded))
                    .foregroundStyle(DS.Palette.ink)
                    .multilineTextAlignment(.center)
                    .focused($nameFocused)
                    .submitLabel(.done)
                if let c = ob.result {
                    Text("\(c.tagline) · \(c.personality)")
                        .font(DS.Typeface.caption).foregroundStyle(DS.Palette.inkSoft)
                        .multilineTextAlignment(.center)
                }
                HStack(spacing: 10) {
                    Button { ob.regenerate(chat: chat) } label: {
                        Label(L.t("Another look", "换一个"), systemImage: "arrow.triangle.2.circlepath")
                            .font(DS.Typeface.caption).foregroundStyle(DS.Palette.ink)
                            .padding(.horizontal, 14).frame(height: 40)
                    }
                    .buttonStyle(.plain).glassEffect(.regular.interactive(), in: .capsule)
                    .disabled(ob.candidates.count < 2)

                    Button { nameFocused = false; ob.finish(chat: chat) } label: {
                        Text(L.t("Start chatting", "开始聊天"))
                            .font(DS.Typeface.bodyMedium).foregroundStyle(DS.Palette.ink)
                            .padding(.horizontal, 22).frame(height: 40)
                    }
                    .buttonStyle(.plain)
                    .glassEffect(.regular.tint(DS.Palette.brand.opacity(0.55)).interactive(), in: .capsule)
                }
                if let img = ob.photo {
                    HStack(spacing: 8) {
                        Image(uiImage: img).resizable().scaledToFill().frame(width: 22, height: 22).clipShape(.circle)
                        Text(L.t("Shaped from your photo (preview)", "根据你的照片塑造（预览）"))
                            .font(DS.Typeface.caption).foregroundStyle(DS.Palette.inkSoft)
                    }
                }
            }
            .padding(22)
            .frame(maxWidth: .infinity)
            .glassEffect(.regular.tint(.white.opacity(0.35)), in: .rect(cornerRadius: 34))
            .padding(.horizontal, DS.Size.sideMargin)
            .padding(.bottom, 26)
        }
    }
}
