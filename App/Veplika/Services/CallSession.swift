import Foundation
import Observation

/// Hands-free voice call: listen → (silence) → send → companion thinks → speaks → listen again.
@MainActor
@Observable
final class CallSession {
    enum Phase { case connecting, listening, thinking, speaking }

    private(set) var phase: Phase = .connecting { didSet { avatar?.callPhase(stagePhase) } }
    private weak var avatar: AvatarController?
    private var stagePhase: String {
        switch phase { case .connecting: "idle"; case .listening: "listening"; case .thinking: "thinking"; case .speaking: "speaking" }
    }
    private(set) var seconds = 0
    private(set) var isActive = false
    var muted = false
    var loudspeaker = true
    /// Live partial transcript of what the user is saying.
    var heard: String { speech?.transcript ?? "" }

    private weak var speech: SpeechService?
    private var loop: Task<Void, Never>?
    private var clock: Task<Void, Never>?

    var statusText: String {
        switch phase {
        case .connecting: L.t("Connecting…", "正在接通…")
        case .listening: muted ? L.t("Muted", "已静音") : L.t("Listening", "正在听你说")
        case .thinking: L.t("Thinking…", "正在想…")
        case .speaking: L.t("Speaking", "正在说话")
        }
    }

    var duration: String { String(format: "%02d:%02d", seconds / 60, seconds % 60) }

    func start(store: ChatStore, speech: SpeechService, avatar: AvatarController) {
        guard !isActive else { return }
        isActive = true
        self.speech = speech
        self.avatar = avatar
        speech.inCall = true
        speech.setLoudspeaker(loudspeaker)
        seconds = 0
        phase = .connecting

        clock = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(1))
                guard let self, self.phase != .connecting else { continue }
                self.seconds += 1
            }
        }

        loop = Task { [weak self] in
            guard let self else { return }
            try? await Task.sleep(for: .milliseconds(900))
            guard !Task.isCancelled else { return }
            avatar.play(.wave)
            phase = .speaking
            speech.speak(store.companion.callGreeting, language: store.companion.voiceLanguage)
            await waitWhileSpeaking(speech)

            while !Task.isCancelled {
                if muted { phase = .listening; try? await Task.sleep(for: .milliseconds(300)); continue }
                phase = .listening
                await speech.startListening(language: store.companion.voiceLanguage)
                if speech.permissionDenied { end(speech: speech); return }

                // End of utterance = transcript non-empty and unchanged for 1.3 s.
                var last = ""
                var stableSince = Date()
                while speech.isListening && !Task.isCancelled && !muted {
                    try? await Task.sleep(for: .milliseconds(150))
                    let t = speech.transcript
                    if t != last { last = t; stableSince = Date() }
                    else if !t.isEmpty && Date().timeIntervalSince(stableSince) > 1.3 { break }
                }
                let utterance = speech.stopListening().trimmingCharacters(in: .whitespacesAndNewlines)
                guard !Task.isCancelled else { return }
                guard !utterance.isEmpty else { try? await Task.sleep(for: .milliseconds(400)); continue }

                phase = .thinking
                store.send(utterance)
                while store.isTyping && !Task.isCancelled { try? await Task.sleep(for: .milliseconds(100)) }
                phase = .speaking
                try? await Task.sleep(for: .milliseconds(350)) // let TTS spin up
                await waitWhileSpeaking(speech)
            }
        }
    }

    func end(speech: SpeechService? = nil) {
        loop?.cancel(); clock?.cancel()
        loop = nil; clock = nil
        let s = speech ?? self.speech
        s?.stopListening()
        s?.stopSpeaking()
        s?.inCall = false
        isActive = false
    }

    func setLoudspeaker(_ on: Bool) {
        loudspeaker = on
        speech?.setLoudspeaker(on)
    }

    private func waitWhileSpeaking(_ speech: SpeechService) async {
        while speech.isSpeaking && !Task.isCancelled { try? await Task.sleep(for: .milliseconds(120)) }
    }
}
