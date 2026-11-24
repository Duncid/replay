import UIKit
import Capacitor
import WebKit

class AppViewController: CAPBridgeViewController {

    // UIKit updates the safe-area bridge when the iPad status bar disappears.
    override var prefersStatusBarHidden: Bool {
        UIDevice.current.userInterfaceIdiom == .pad || super.prefersStatusBarHidden
    }

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        #if DEBUG
        if ProcessInfo.processInfo.arguments.contains("--replay-performance"),
           let url = Bundle.main.url(forResource: "performance-probe", withExtension: "js", subdirectory: "public"),
           let source = try? String(contentsOf: url, encoding: .utf8) {
            bridge?.webView?.configuration.userContentController.add(PerformanceHandler(), name: "replayPerformance")
            bridge?.webView?.configuration.userContentController.addUserScript(
                WKUserScript(source: performanceConfiguration() + source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        }
        #endif
        // print("[MIDI Bridge] [DEBUG] AppViewController.capacitorDidLoad - registering MidiBridgePlugin")
        bridge?.registerPluginInstance(MidiBridgePlugin())
        bridge?.registerPluginInstance(ReplayAuthPlugin())
        bridge?.webView?.configuration.userContentController.add(
            SafeAreaHandler(owner: self), name: "replaySafeArea"
        )
        bridge?.webView?.configuration.userContentController.addUserScript(
            WKUserScript(source: "window.webkit.messageHandlers.replaySafeArea.postMessage({});", injectionTime: .atDocumentEnd, forMainFrameOnly: true)
        )
        // print("[MIDI Bridge] [DEBUG] AppViewController.capacitorDidLoad - MidiBridgePlugin registered")
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        updateSafeAreaInsets()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        updateSafeAreaInsets()
    }

    fileprivate func updateSafeAreaInsets() {
        bridge?.webView?.evaluateJavaScript(safeAreaScript())
    }

    private func safeAreaScript() -> String {
        let insets = view.safeAreaInsets
        return """
        document.documentElement.style.setProperty('--safe-area-inset-top', '\(insets.top)px');
        document.documentElement.style.setProperty('--safe-area-inset-right', '\(insets.right)px');
        document.documentElement.style.setProperty('--safe-area-inset-bottom', '\(insets.bottom)px');
        document.documentElement.style.setProperty('--safe-area-inset-left', '\(insets.left)px');
        """
    }
}

private final class SafeAreaHandler: NSObject, WKScriptMessageHandler {
    private weak var owner: AppViewController?

    init(owner: AppViewController) {
        self.owner = owner
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        owner?.updateSafeAreaInsets()
    }
}

#if DEBUG
private func performanceConfiguration() -> String {
    let args = ProcessInfo.processInfo.arguments
    let count = args.first(where: { $0.hasPrefix("--performance-notes=") }).flatMap { Int($0.split(separator: "=").last!) } ?? 200
    let seconds = args.first(where: { $0.hasPrefix("--performance-seconds=") }).flatMap { Int($0.split(separator: "=").last!) } ?? 8
    let config: [String: Any] = ["notes": count, "seconds": seconds, "full": args.contains("--performance-full")]
    let json = String(data: try! JSONSerialization.data(withJSONObject: config), encoding: .utf8)!
    return "window.__replayPerformanceConfig = \(json);\n"
}

private final class PerformanceHandler: NSObject, WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard var result = message.body as? [String: Any] else { return }
        result["nativeLaunchElapsedMs"] = (ProcessInfo.processInfo.systemUptime - AppDelegate.launchStartedAt) * 1000
        if let data = try? JSONSerialization.data(withJSONObject: result, options: [.sortedKeys]),
           let json = String(data: data, encoding: .utf8) {
            print("[Replay Performance] " + json)
            fflush(stdout)
        }
    }
}
#endif
