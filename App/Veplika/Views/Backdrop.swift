import SwiftUI

/// Slowly drifting pastel mesh. The glass UI refracts it (companion picker) and onboarding sits on it.
struct Backdrop: View {
    var top: Color = DS.Palette.auroraTop
    var mid: Color = DS.Palette.auroraMid
    var low: Color = DS.Palette.auroraLow

    var body: some View {
        TimelineView(.animation(minimumInterval: 1 / 20)) { ctx in
            let t = Float(ctx.date.timeIntervalSinceReferenceDate.truncatingRemainder(dividingBy: 600))
            MeshGradient(width: 3, height: 3, points: [
                [0, 0], [0.5, 0], [1, 0],
                [0, 0.5], [0.5 + 0.14 * sin(t * 0.35), 0.5 + 0.12 * cos(t * 0.28)], [1, 0.5],
                [0, 1], [0.5, 1], [1, 1],
            ], colors: [top, mid, low, mid, .white, top, low, top, mid])
        }
        .ignoresSafeArea()
    }
}
