import AVFoundation
import Observation

/// Full-duplex voice call with Doubao Seeduplex 3.0 through the dev relay (`relay/`, PRODUCT.md R9a).
/// The mic streams continuously, she can be interrupted, and the reply audio plays as it arrives.
@MainActor
@Observable
final class RealtimeCall {
    enum State: Equatable { case connecting, live, failed, ended }

    private(set) var state: State = .connecting
    /// True while her reply audio is playing.
    private(set) var companionSpeaking = false {
        didSet {
            guard companionSpeaking != oldValue else { return }
            onSpeakingChanged?(companionSpeaking)
            if !companionSpeaking, wantsToHangUp { onHangUp?() }
        }
    }
    /// Live transcript of what the user is saying.
    private(set) var heard = ""
    var muted = false { didSet { audio.muted = muted } }

    var onUserSaid: ((String) -> Void)?
    var onCompanionSaid: ((String) -> Void)?
    var onLive: (() -> Void)?
    var onSpeakingChanged: ((Bool) -> Void)?
    var onFailed: (() -> Void)?
    /// The user said goodbye; fired once her goodbye has finished playing.
    var onHangUp: (() -> Void)?
    /// A tool call from the model, `(name, JSON arguments)`; returns the result text given back to the model.
    var onTool: ((String, String) -> String)?

    private let companion: Companion
    private let history: [ChatMessage]
    private let audio = DuplexAudio()
    private var wantsToHangUp = false
    private var socket: URLSessionWebSocketTask?
    private var receiver: Task<Void, Never>?

    /// The relay address. The simulator reaches the Mac directly; a phone needs the Mac's LAN address in Settings.
    static var relayURL: URL? {
        if let s = UserDefaults.standard.string(forKey: "relayURL"), !s.isEmpty { return URL(string: s) }
        #if targetEnvironment(simulator)
        return URL(string: "ws://127.0.0.1:8787/realtime")
        #else
        return nil
        #endif
    }

    /// `history` is the chat so far (text messages and earlier call transcripts); its recent turns become her context.
    init(companion: Companion, history: [ChatMessage]) {
        self.companion = companion
        self.history = history
    }

    func start(url: URL) {
        let task = URLSession.shared.webSocketTask(with: url)
        socket = task
        task.resume()
        audio.onSpeaking = { [weak self] on in Task { @MainActor in self?.companionSpeaking = on } }
        audio.onFrame = { [weak task] frame in
            task?.send(.string(Self.json(["type": "input_audio_buffer.append", "audio": frame.base64EncodedString()]))) { _ in }
        }
        send(sessionCreate())
        receiver = Task { [weak self] in
            while let self, !Task.isCancelled {
                guard let msg = try? await task.receive() else { self.fail("socket closed"); return }
                if case .string(let s) = msg, let data = s.data(using: .utf8),
                   let event = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                    self.handle(event)
                }
            }
        }
    }

    func end() {
        guard state != .ended else { return }
        state = .ended
        audio.stop()
        send(["type": "session.close"])
        receiver?.cancel()
        // The relay also closes the session if this frame is lost; give it a moment to go out.
        let task = socket
        Task { try? await Task.sleep(for: .milliseconds(400)); task?.cancel(with: .goingAway, reason: nil) }
        socket = nil
    }

    // MARK: Events

    private func handle(_ e: [String: Any]) {
        switch e["type"] as? String {
        case "session.created":
            Task { await startAudio() }
        case "conversation.item.input_audio_transcription.started":
            // The user started talking: stop her right away (barge-in).
            audio.interrupt()
            heard = ""
        case "conversation.item.input_audio_transcription.delta":
            // Despite the name, each delta is the whole sentence so far, not the new characters.
            if let text = e["delta"] as? String { heard = text }
        case "conversation.item.input_audio_transcription.completed":
            // Docs say `transcript`; the server sends `text`.
            let text = (e["text"] as? String ?? e["transcript"] as? String ?? heard).trimmingCharacters(in: .whitespacesAndNewlines)
            heard = text
            if !text.isEmpty { onUserSaid?(text) }
        case "response.output_audio.delta":
            if let b64 = e["delta"] as? String, let pcm = Data(base64Encoded: b64) { audio.play(pcm) }
        case "response.output_audio.done":
            // Exit intent (enable_user_query_exit): hang up after her goodbye has played.
            if "\(e["status_code"] ?? "")" == "20000002" {
                wantsToHangUp = true
                if !companionSpeaking { onHangUp?() }
            }
        case "response.function_call_arguments.done":
            answerTools(e["items"] as? [[String: Any]] ?? [])
        case "response.output_text.done":
            let text = (e["text"] as? String ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty { onCompanionSaid?(text) }
        case "error":
            debugLog("realtime error: \(e)")
            if state == .connecting { fail("upstream") }
        case "session.closed":
            if state != .ended { fail("closed") }
        default:
            break
        }
    }

    private func startAudio() async {
        guard await AVAudioApplication.requestRecordPermission() else {
            debugLog("realtime: microphone permission denied")
            fail("mic permission")
            return
        }
        guard state == .connecting else { return }
        do {
            try audio.start()
            state = .live
            onLive?()
            send(["type": "speech_text_buffer.commit", "text": companion.callGreeting])
        } catch {
            debugLog("realtime: audio start failed \(error)")
            fail("audio")
        }
    }

    private func fail(_ why: String) {
        guard state != .ended, state != .failed else { return }
        debugLog("realtime: failed (\(why))")
        state = .failed
        audio.stop()
        receiver?.cancel()
        socket?.cancel(with: .goingAway, reason: nil)
        socket = nil
        onFailed?()
    }

    // MARK: Session

    private func sessionCreate() -> [String: Any] {
        [
            "type": "session.create",
            "session": [
                "model": "1.2.6.1",
                "instructions": instructions,
                "audio": [
                    "input": ["format": ["type": "pcm", "rate": 16000]],
                    "output": ["format": ["type": "pcm_s16le", "rate": 24000], "voice": voice],
                ],
                "tools": Self.tools,
            ],
            "extension": [
                "extra": ["enable_proactive_speak": true],
                // Second-pass recognition is more accurate (≈ +0.1–0.3 s); hotwords need it.
                "asr": ["extra": ["enable_asr_twopass": true, "context": ["hotwords": [["word": companion.name]]]]],
                "dialog": [
                    "extra": ["enable_user_query_exit": true, "enable_music": true],
                    "dialog_context": dialogContext,
                ],
            ],
        ]
    }

    /// The last turns of the chat as user/assistant pairs, as Doubao requires: consecutive lines from the same
    /// side are joined, a leading companion line and a trailing unanswered user line are dropped.
    private var dialogContext: [[String: String]] {
        var turns: [(ChatMessage.Role, String)] = []
        for m in history {
            if let last = turns.last, last.0 == m.role { turns[turns.count - 1].1 += " " + m.text }
            else { turns.append((m.role, m.text)) }
        }
        if turns.first?.0 == .companion { turns.removeFirst() }
        if turns.count % 2 == 1 { turns.removeLast() }
        // The most recent 12 pairs, within ~3000 characters to stay well inside the 12K-token budget.
        var recent: [(String, String)] = []
        var budget = 3000
        for i in stride(from: turns.count - 2, through: 0, by: -2) {
            budget -= turns[i].1.count + turns[i + 1].1.count
            guard budget > 0, recent.count < 12 else { break }
            recent.insert((turns[i].1, turns[i + 1].1), at: 0)
        }
        return recent.flatMap { [["role": "user", "text": $0.0], ["role": "assistant", "text": $0.1]] }
    }

    /// The model waits for tool results before it speaks, which adds ~1.5 s, so tools are for explicit requests only.
    static let gestures = ["wave", "nod", "clap", "cheer", "heart", "laugh", "shy", "think", "shrug"]
    private static let tools: [[String: Any]] = [
        ["type": "function", "name": "do_gesture",
         "description": "Make a visible body gesture on the video call. Only call this when the user explicitly asks you to do an action (wave, nod, clap, cheer, make a heart, laugh, act shy, think, shrug). Never call it on your own.",
         "parameters": ["type": "object",
                        "properties": ["gesture": ["type": "string", "enum": gestures]],
                        "required": ["gesture"]]],
        ["type": "function", "name": "change_background",
         "description": "Switch the video-call background to the next room. Only when the user asks to change the background or scenery.",
         "parameters": ["type": "object", "properties": [String: Any]()]],
    ]

    /// Run every call in the batch and return all results at once; the model continues only after that.
    private func answerTools(_ calls: [[String: Any]]) {
        let results: [[String: Any]] = calls.map { call in
            let name = call["name"] as? String ?? ""
            let result = onTool?(name, call["arguments"] as? String ?? "{}") ?? #"{"ok":false}"#
            return ["call_id": call["call_id"] ?? "", "role": "tool", "content": [["type": "input_text", "text": result]]]
        }
        send(["type": "conversation.item.create", "items": results])
    }

    /// Seeduplex 3.0 stock voices (Chinese). English-capable voices are still to be evaluated (R9a gaps).
    private var voice: String {
        companion.gender == .male ? "zh_male_yunzhou_jupiter_bigtts" : "zh_female_vv_jupiter_bigtts"
    }

    private var instructions: String {
        let music = (UserDefaults.standard.stringArray(forKey: "pref.musicGenres") ?? []).joined(separator: ", ")
        let language = L.current == .en ? "Always speak English." : "请始终用中文说话。"
        return """
        You are \(companion.name), the user's companion, on a live video call with them. \
        Personality: \(companion.personality). About you: \(companion.tagline). \
        Talk like a real person on a phone call: short, natural, warm sentences; react to what they say; \
        ask a question back now and then; never read lists or describe actions in brackets. \
        \(music.isEmpty ? "" : "The user likes this music: \(music). ")\(language)
        """
    }

    private func send(_ event: [String: Any]) {
        socket?.send(.string(Self.json(event))) { error in
            if let error { debugLog("realtime send: \(error.localizedDescription)") }
        }
    }

    nonisolated private static func json(_ v: [String: Any]) -> String {
        (try? JSONSerialization.data(withJSONObject: v)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }
}

/// Mic capture and reply playback on one voice-processing engine, so the phone's echo canceller can
/// remove her voice from the mic even on loudspeaker. Capture is sent as 16 kHz int16 frames of 20 ms,
/// paced to real time as Doubao requires; playback takes 24 kHz int16 chunks.
final class DuplexAudio: @unchecked Sendable {
    var onFrame: ((Data) -> Void)?
    var onSpeaking: ((Bool) -> Void)?
    /// Set from the main actor, read on the audio queue.
    var muted: Bool {
        get { lock.withLock { isMuted } }
        set { lock.withLock { isMuted = newValue } }
    }

    private let engine = AVAudioEngine()
    private let player = AVAudioPlayerNode()
    private let playFormat = AVAudioFormat(standardFormatWithSampleRate: 24_000, channels: 1)!
    private let sendFormat = AVAudioFormat(commonFormat: .pcmFormatInt16, sampleRate: 16_000, channels: 1, interleaved: true)!
    private let queue = DispatchQueue(label: "veplika.duplex-audio")
    private var timer: DispatchSourceTimer?
    private var converter: AVAudioConverter?

    // Guarded by `lock`.
    private let lock = NSLock()
    private var captured = Data()
    private var priming = true
    private var pending = 0
    private var generation = 0
    private var playbackEnded = Date.distantPast
    private var isMuted = false

    private var stats = (captured: 0, silent: 0, callbacks: 0, since: Date())

    // Uplink clock, only touched on `queue`.
    private var clockStart = DispatchTime.now()
    private var sent = 0

    private static let frameBytes = 640 // 20 ms at 16 kHz int16

    func start() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .voiceChat, options: [.defaultToSpeaker, .allowBluetoothHFP])
        try session.setPreferredIOBufferDuration(0.01)
        try session.setActive(true)

        let input = engine.inputNode
        // Echo cancellation. The simulator's voice-processing unit delivers no mic input at all, so it is skipped there.
        #if !targetEnvironment(simulator)
        try input.setVoiceProcessingEnabled(true)
        #endif
        let inFormat = input.outputFormat(forBus: 0)
        let converter = AVAudioConverter(from: inFormat, to: sendFormat)
        converter?.downmix = true
        self.converter = converter
        debugLog("realtime mic: \(inFormat) converter=\(converter != nil)")
        input.installTap(onBus: 0, bufferSize: 256, format: inFormat) { [weak self] buffer, _ in self?.capture(buffer) }

        engine.attach(player)
        engine.connect(player, to: engine.mainMixerNode, format: playFormat)
        engine.prepare()
        try engine.start()
        player.play()

        queue.sync { clockStart = .now(); sent = 0 }
        lock.withLock { stats = (0, 0, 0, Date()) }
        let timer = DispatchSource.makeTimerSource(queue: queue)
        timer.schedule(deadline: .now(), repeating: .milliseconds(20), leeway: .milliseconds(2))
        timer.setEventHandler { [weak self] in self?.tick() }
        timer.resume()
        self.timer = timer
    }

    func stop() {
        timer?.cancel()
        timer = nil
        guard engine.isRunning else { return }
        engine.inputNode.removeTap(onBus: 0)
        player.stop()
        engine.stop()
        try? engine.inputNode.setVoiceProcessingEnabled(false)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// Queue a chunk of her reply (24 kHz mono int16).
    func play(_ pcm: Data) {
        let count = pcm.count / 2
        guard count > 0, let buffer = AVAudioPCMBuffer(pcmFormat: playFormat, frameCapacity: AVAudioFrameCount(count)) else { return }
        buffer.frameLength = AVAudioFrameCount(count)
        let out = buffer.floatChannelData![0]
        pcm.withUnsafeBytes { raw in
            let samples = raw.bindMemory(to: Int16.self)
            for i in 0..<count { out[i] = Float(Int16(littleEndian: samples[i])) / 32768 }
        }
        let (gen, first) = lock.withLock { pending += 1; return (generation, pending == 1) }
        if first { onSpeaking?(true) }
        player.scheduleBuffer(buffer) { [weak self] in
            guard let self else { return }
            let done = self.lock.withLock { () -> Bool in
                guard gen == self.generation else { return false }
                self.pending -= 1
                if self.pending == 0 { self.playbackEnded = Date() }
                return self.pending == 0
            }
            if done { self.onSpeaking?(false) }
        }
    }

    /// Drop everything she was about to say.
    func interrupt() {
        lock.withLock { generation += 1; pending = 0; playbackEnded = Date() }
        player.stop()
        player.play()
        onSpeaking?(false)
    }

    private func capture(_ buffer: AVAudioPCMBuffer) {
        guard let converter else { return }
        let ratio = sendFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount(Double(buffer.frameLength) * ratio) + 32
        guard let out = AVAudioPCMBuffer(pcmFormat: sendFormat, frameCapacity: capacity) else { return }
        var fed = false
        converter.convert(to: out, error: nil) { _, status in
            if fed { status.pointee = .noDataNow; return nil }
            fed = true
            status.pointee = .haveData
            return buffer
        }
        let bytes = Data(bytes: out.int16ChannelData![0], count: Int(out.frameLength) * 2)
        lock.withLock {
            captured.append(bytes)
            stats.captured += bytes.count
            stats.callbacks += 1
            // Never let the backlog add more than ~200 ms of delay.
            if captured.count > 10 * Self.frameBytes { captured.removeFirst(captured.count - 4 * Self.frameBytes) }
        }
    }

    /// The simulator has no echo cancellation (see `start`), so her voice from the Mac speakers would come back
    /// through the mic and be answered as if the user said it. There the mic is closed while she speaks and for
    /// 300 ms after, which also means no barge-in in the simulator. On a device the echo canceller handles it.
    private var echoGate: Bool {
        #if targetEnvironment(simulator)
        lock.withLock { pending > 0 || Date().timeIntervalSince(playbackEnded) < 0.3 }
        #else
        false
        #endif
    }

    /// Doubao needs uplink at exactly real time, so frames follow a 20 ms clock rather than the mic's delivery.
    /// A 40 ms jitter buffer absorbs the mic's uneven callbacks; if the mic falls behind, the gap is sent as silence.
    private func tick() {
        let elapsed = Double(DispatchTime.now().uptimeNanoseconds - clockStart.uptimeNanoseconds) / 1e9
        let due = Int(elapsed / 0.02) + 1
        if due - sent > 5 { sent = due - 1 } // woke up very late: skip ahead instead of bursting
        var frames: [Data] = []
        lock.withLock {
            while sent < due {
                sent += 1
                if priming, captured.count >= 2 * Self.frameBytes { priming = false }
                if !priming, captured.count >= Self.frameBytes {
                    frames.append(Data(captured.prefix(Self.frameBytes)))
                    captured.removeFirst(Self.frameBytes)
                } else {
                    priming = true
                    stats.silent += 1
                    frames.append(Data(count: Self.frameBytes))
                }
            }
        }
        let silenced = muted || echoGate
        for frame in frames { onFrame?(silenced ? Data(count: Self.frameBytes) : frame) }
        let report = lock.withLock { () -> (Int, Int, Int, Double)? in
            let seconds = Date().timeIntervalSince(stats.since)
            guard seconds >= 5 else { return nil }
            defer { stats = (0, 0, 0, Date()) }
            return (stats.captured, stats.silent, stats.callbacks, seconds)
        }
        if let (got, silent, callbacks, seconds) = report {
            debugLog(String(format: "realtime uplink: mic %.0f%% of real time (%d callbacks), %d silent frames in %.0f s",
                            Double(got) / (32_000 * seconds) * 100, callbacks, silent, seconds))
        }
    }
}
