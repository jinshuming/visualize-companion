import SwiftUI

@main
struct VeplikaApp: App {
    @State private var store = ChatStore()
    @State private var avatar = AvatarController()
    @State private var speech = SpeechService()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(store)
                .environment(avatar)
                .environment(speech)
        }
    }
}
