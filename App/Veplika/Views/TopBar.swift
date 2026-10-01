import SwiftUI

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
