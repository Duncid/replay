import UIKit
import Capacitor

class AppViewController: CAPBridgeViewController {

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // print("[MIDI Bridge] [DEBUG] AppViewController.capacitorDidLoad - registering MidiBridgePlugin")
        bridge?.registerPluginInstance(MidiBridgePlugin())
        // print("[MIDI Bridge] [DEBUG] AppViewController.capacitorDidLoad - MidiBridgePlugin registered")
    }
}
