import SwiftUI

@main
struct VeplikaApp: App {
    @State private var store = ChatStore()
    @State private var avatar = AvatarController()
    @State private var speech = SpeechService()
    @State private var onboarding = OnboardingStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(avatar)
                .environment(speech)
                .environment(onboarding)
        }
    }
}
