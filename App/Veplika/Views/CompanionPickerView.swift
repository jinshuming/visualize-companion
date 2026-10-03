import SwiftUI

struct CompanionPickerView: View {
    @Environment(ChatStore.self) private var store
    let onPicked: () -> Void
    @State private var focusID: String?
    private var pickerCompanion: Companion { Companion.find(focusID ?? store.companion.id) }

    var body: some View {
        ZStack {
            Backdrop(top: pickerCompanion.secondary.opacity(0.8), mid: pickerCompanion.accent.opacity(0.6), low: pickerCompanion.secondary.opacity(0.7))
                .animation(.smooth(duration: 0.6), value: focusID)
            VStack(alignment: .leading, spacing: 8) {
                Text(L.t("Choose your companion", "选择你的伙伴")).font(.largeTitle.bold()).foregroundStyle(DS.Palette.ink).padding(.horizontal, 24).padding(.top, 24)
                Text(L.t("3D digital humans made with PINOC", "由 PINOC 生成的 3D 数字人")).font(.subheadline).foregroundStyle(DS.Palette.inkSoft).padding(.horizontal, 24)
                Spacer(minLength: 0)
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 16) {
                        ForEach(Companion.all) { card($0) }
                    }
                    .scrollTargetLayout()
                }
                .scrollTargetBehavior(.viewAligned)
                .scrollPosition(id: $focusID)
                .contentMargins(.horizontal, 32, for: .scrollContent)
                .scrollIndicators(.hidden)
                Spacer(minLength: 0)
            }
        }
        .onAppear { focusID = store.companion.id }
    }

    private func card(_ c: Companion) -> some View {
        let selected = store.companion == c
        return VStack(spacing: 14) {
            Group {
                if let img = c.thumbnail {
                    Image(uiImage: img).resizable().scaledToFit()
                } else {
                    Color.gray.opacity(0.2)
                }
            }
            .frame(height: 300)
            .clipShape(.rect(cornerRadius: 24))

            VStack(spacing: 4) {
                Text(c.name).font(.title2.bold()).foregroundStyle(DS.Palette.ink)
                Text(c.tagline).font(.subheadline.weight(.medium)).foregroundStyle(DS.Palette.inkSoft)
                Text(c.personality).font(.footnote).foregroundStyle(DS.Palette.inkSoft).multilineTextAlignment(.center)
            }

            Button {
                store.select(c)
                onPicked()
            } label: {
                Text(selected ? L.t("With you now", "正在陪伴你") : L.t("Chat with them", "和 Ta 聊聊")).frame(maxWidth: .infinity)
                    .foregroundStyle(DS.Palette.ink)
            }
            .buttonStyle(.glassProminent)
            .tint(c.accent)
            .controlSize(.large)
        }
        .padding(16)
        .glassEffect(.regular, in: .rect(cornerRadius: 36))
        .containerRelativeFrame(.horizontal) { w, _ in w - 64 }
        .id(c.id)
    }
}
