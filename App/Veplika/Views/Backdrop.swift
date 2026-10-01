import SwiftUI

/// Soft animated mesh gradient tinted by the companion; it's what the glass UI refracts.
struct Backdrop: View {
    let companion: Companion

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20)) { ctx in
            let p = Float(ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 600))
            let a = companion.accent, b = companion.secondary
            MeshGradient(width: 3, height: 3, points: [
                [0, 0], [0.5, 0], [1, 0],
                [0, 0.5], [0.5 + 0.12 * sin(p * 0.4), 0.5 + 0.1 * cos(p * 0.3)], [1, 0.5],
                [0, 1], [0.5, 1], [1, 1],
            ], colors: [
                b.opacity(0.9), a.opacity(0.55), b.opacity(0.8),
                a.opacity(0.7), Color(white: 0.96), a.opacity(0.5),
                b.opacity(0.6), a.opacity(0.85), b.opacity(0.9),
            ])
        }
        .ignoresSafeArea()
    }
}
