import SwiftUI
import WebKit
import Observation

/// Owns the single WKWebView that renders the PINOC Gaussian-splat character with Viggle's splat engine.
/// The view is created once and reused, so switching tabs never reloads the 2 MB character.
@MainActor
@Observable
final class AvatarController: NSObject {
    enum Status: Equatable { case starting, ready, loading, loaded, failed(String) }

    private(set) var status: Status = .starting
    let webView: WKWebView

    private var wantedCompanion: String?
    private var wantedProfile = Companion.Style.chibi
    private var wantedMode = "chat"
    private var engineReady = false

    override init() {
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(BundleSchemeHandler(), forURLScheme: BundleSchemeHandler.scheme)
        let handler = WeakScriptHandler()
        config.userContentController.add(handler, name: "stage")
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        handler.target = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.isUserInteractionEnabled = false
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        webView.load(URLRequest(url: URL(string: "\(BundleSchemeHandler.scheme)://app/stage.html")!))
    }

    func show(_ companion: Companion) {
        wantedCompanion = companion.id
        wantedProfile = companion.style
        pushCompanion()
    }

    /// Camera preset: "chat" (bust, left third), "space" (full body, orbitable) or "call" (face close-up).
    /// The web stage glides between presets.
    func setMode(_ name: String) {
        wantedMode = name
        if engineReady { run("window.stage.setMode('\(name)')") }
    }

    func orbit(yaw: Double, pitch: Double) { run("window.stage.orbit(\(yaw), \(pitch))") }
    func zoom(_ factor: Double) { run("window.stage.zoom(\(factor))") }
    func resetOrbit() { run("window.stage.resetOrbit()") }
    func nextTheme() { run("window.stage.nextTheme()") }
    func setDebug(_ on: Bool) { run("window.stage.setDebug(\(on))") }

    func play(_ gesture: Gesture) {
        guard status == .loaded else { return }
        run("window.stage.gesture('\(gesture.rawValue)')")
    }

    #if DEBUG
    func thumbPrep(dist: Double, ty: Double) { run("window.stage.thumbPrep(\(dist), \(ty))") }
    func debugEval(_ js: String) { run(js) }
    func setClear(_ hex: String) { run("window.stage.setClear('\(hex)')") }

    /// Runs the web stage's scripted frame-rate probe and returns its JSON report.
    func runPerfProbe() async -> String? {
        let js = "return JSON.stringify(await window.stage.runProbe())"
        return try? await webView.callAsyncJavaScript(js, contentWorld: .page) as? String
    }
    #endif

    private func pushCompanion() {
        guard engineReady, let id = wantedCompanion else { return }
        run("void window.stage.load('\(id)', '\(wantedProfile.rawValue)')")
    }

    private func run(_ js: String) {
        webView.evaluateJavaScript(js, completionHandler: nil)
    }

    fileprivate func handle(_ body: Any) {
        guard let dict = body as? [String: Any], let type = dict["type"] as? String else { return }
        switch type {
        case "ready":
            engineReady = true
            status = .ready
            if UserDefaults.standard.bool(forKey: "diagnostics"), !ProcessInfo.processInfo.arguments.contains("-thumbCapture") { setDebug(true) }
            run("window.stage.setMode('\(wantedMode)', true)")
            pushCompanion()
        case "loading": status = .loading
        case "loaded":
            status = .loaded
            play(.wave)
        case "error": status = .failed(dict["message"] as? String ?? "unknown")
        case "log": debugLog(dict["message"] as? String ?? "")
        default: break
        }
    }
}

private final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: AvatarController?
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        let body = message.body
        Task { @MainActor in self.target?.handle(body) }
    }
}

struct AvatarStageView: UIViewRepresentable {
    let controller: AvatarController
    func makeUIView(context: Context) -> WKWebView { controller.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

/// Serves the bundled `Web` folder under `veplika://app/…` so the engine can fetch assets, spawn its
/// blob worker and parse splats without a network or a localhost server. Supports HTTP Range.
final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
    static let scheme = "veplika"
    private let root = Bundle.main.url(forResource: "Web", withExtension: nil)!.standardizedFileURL

    func webView(_ webView: WKWebView, start task: WKURLSchemeTask) {
        guard let url = task.request.url else { return task.didFailWithError(URLError(.badURL)) }
        var path = url.path
        if path.hasPrefix("/") { path.removeFirst() }
        if path.isEmpty { path = "stage.html" }
        let file = root.appendingPathComponent(path).standardizedFileURL
        guard file.path.hasPrefix(root.path), let data = try? Data(contentsOf: file) else {
            return task.didFailWithError(URLError(.fileDoesNotExist))
        }

        var status = 200
        var body = data
        var headers = [
            "Content-Type": mime(file.pathExtension),
            "Access-Control-Allow-Origin": "*",
            "Accept-Ranges": "bytes",
        ]
        if let range = task.request.value(forHTTPHeaderField: "Range"), range.hasPrefix("bytes=") {
            let parts = range.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
            let start = Int(parts.first ?? "") ?? 0
            let end = min(parts.count > 1 ? (Int(parts[1]) ?? data.count - 1) : data.count - 1, data.count - 1)
            if start <= end {
                status = 206
                body = data.subdata(in: start..<(end + 1))
                headers["Content-Range"] = "bytes \(start)-\(end)/\(data.count)"
            }
        }
        headers["Content-Length"] = String(body.count)
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        task.didReceive(response)
        task.didReceive(body)
        task.didFinish()
    }

    func webView(_ webView: WKWebView, stop task: WKURLSchemeTask) {}

    private func mime(_ ext: String) -> String {
        switch ext {
        case "html": "text/html; charset=utf-8"
        case "js": "text/javascript; charset=utf-8"
        case "webp": "image/webp"
        case "glb": "model/gltf-binary"
        default: "application/octet-stream"
        }
    }
}
