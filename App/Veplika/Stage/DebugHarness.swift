#if DEBUG
/// Appends to Documents/debug.log so flows driven from a host script can be inspected afterwards.
func debugLog(_ line: String) {
    let url = URL.documentsDirectory.appendingPathComponent("debug.log")
    let text = "\(Date().formatted(date: .omitted, time: .standard)) \(line)\n"
    if let h = try? FileHandle(forWritingTo: url) { h.seekToEndOfFile(); h.write(Data(text.utf8)); try? h.close() }
    else { try? text.write(to: url, atomically: true, encoding: .utf8) }
}
#else
@inline(__always) func debugLog(_ line: String) {}
#endif

#if DEBUG
import SwiftUI

/// Scripted runs for host scripts, chosen by launch argument. Results land in Documents/.
///  - `-thumbCapture -companion <id> [-thumbDist 4.9 -thumbTy 0.95]`: publish white/black frames for `scripts/capture_thumb.sh`
///  - `-onboardingAuto`: fill the answers and sample photo, generate, finish (checks the onboarding path end to end)
///  - `-perfProbe`: frame-rate probe, written to `perf.json`
@MainActor
enum DebugHarness {
    static func run(avatar: AvatarController, store: ChatStore, onboarding: OnboardingStore) async {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("-thumbCapture") { await captureThumbnail(avatar) }
        else if args.contains("-onboardingAuto") { await autoOnboard(avatar, store, onboarding) }
        else if args.contains("-perfProbe") { await perfProbe(avatar) }
    }

    private static func waitLoaded(_ avatar: AvatarController, orReady: Bool = false) async {
        while avatar.status != .loaded && !(orReady && avatar.status == .ready) { try? await Task.sleep(for: .milliseconds(200)) }
    }

    /// Alternates white/black backgrounds with the animation frozen so the host can recover true alpha.
    private static func captureThumbnail(_ avatar: AvatarController) async {
        await waitLoaded(avatar)
        try? await Task.sleep(for: .seconds(1.5))
        let dist = UserDefaults.standard.double(forKey: "thumbDist")
        let ty = UserDefaults.standard.double(forKey: "thumbTy")
        avatar.thumbPrep(dist: dist > 0 ? dist : 4.9, ty: ty != 0 ? ty : 0.95)
        let state = URL.documentsDirectory.appendingPathComponent("thumb-state.txt")
        for (name, hex) in [("white", "#ffffff"), ("black", "#000000")] {
            avatar.setClear(hex)
            try? await Task.sleep(for: .seconds(1.2))
            try? name.write(to: state, atomically: true, encoding: .utf8)
            try? await Task.sleep(for: .seconds(3))
        }
        try? "done".write(to: state, atomically: true, encoding: .utf8)
    }

    private static func autoOnboard(_ avatar: AvatarController, _ store: ChatStore, _ onboarding: OnboardingStore) async {
        await waitLoaded(avatar, orReady: true)
        onboarding.answers = ["you": "female", "partner": "female", "personality": "gentle", "style": "sweet",
                              "together": "talk", "visual": "cartoon"]
        onboarding.music = ["lofi", "pop"]
        onboarding.photo = Companion.all.first?.thumbnail
        await onboarding.generate(chat: store)
        try? await Task.sleep(for: .seconds(2))
        debugLog("auto: before finish store=\(store.companion.id) result=\(onboarding.result?.id ?? "nil")")
        onboarding.finish(chat: store)
        try? await Task.sleep(for: .seconds(1))
        debugLog("auto: after finish store=\(store.companion.id) name=\(store.companion.name)")
    }

    private static func perfProbe(_ avatar: AvatarController) async {
        await waitLoaded(avatar)
        try? await Task.sleep(for: .seconds(2))
        guard let json = await avatar.runPerfProbe() else { return }
        let url = URL.documentsDirectory.appendingPathComponent("perf.json")
        try? json.write(to: url, atomically: true, encoding: .utf8)
        print("PERF_PROBE_DONE \(url.path)")
    }
}
#endif
