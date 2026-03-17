interface IosMidiBridgeMessage {
  type: "midi/request-access" | "midi/disconnect";
}

type MidiPacket = number[];

interface IosMidiBridgeHandler {
  postMessage: (message: IosMidiBridgeMessage) => void;
}

interface CapacitorMidiBridge {
  ping: () => Promise<{ ok: boolean; message?: string }>;
  requestAccess: () => Promise<{ sources: string[] }>;
  disconnect: () => Promise<void>;
}

interface WindowWithIosBridge extends Window {
  Capacitor?: {
    isNativePlatform?: () => boolean;
  };
  webkit?: {
    messageHandlers?: {
      midiBridge?: IosMidiBridgeHandler;
    };
  };
  __dispatchIOSMidiMessage?: (packet: MidiPacket) => void;
}

const NOTE_DATA_LENGTH = 3;
const IOS_MIDI_EVENT_NAME = "ios-midi-message";

const normalizePacket = (packet: MidiPacket): Uint8Array | null => {
  if (!Array.isArray(packet)) return null;
  if (packet.length < NOTE_DATA_LENGTH) return null;

  const [status, data1, data2] = packet;
  if ([status, data1, data2].some((value) => typeof value !== "number" || Number.isNaN(value))) {
    return null;
  }

  return new Uint8Array([status & 0xff, data1 & 0x7f, data2 & 0x7f]);
};

const installIosWebMidiPolyfill = () => {
  if (typeof window === "undefined") return;
  if ("requestMIDIAccess" in navigator) return;

  const scopedWindow = window as WindowWithIosBridge;
  const isCapacitorUrl =
    typeof window.location?.href === "string" &&
    (window.location.href.startsWith("capacitor://") || window.location.href.startsWith("ionic://"));
  const isCapacitor =
    !!scopedWindow.Capacitor?.isNativePlatform?.() || (isCapacitorUrl && !!scopedWindow.Capacitor);
  const webkitBridge = scopedWindow.webkit?.messageHandlers?.midiBridge;

  if (!isCapacitor && !webkitBridge) {
    if (isCapacitorUrl) {
      const maxRetries = 10;
      let retryCount = 0;
      const retry = () => {
        if ("requestMIDIAccess" in navigator) return;
        retryCount++;
        console.log("[MIDI Polyfill] Capacitor not ready, retry", retryCount, "/", maxRetries);
        if (retryCount < maxRetries) {
          setTimeout(retry, 200);
        }
        installIosWebMidiPolyfill();
      };
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", retry);
      } else {
        setTimeout(retry, 200);
      }
    }
    return;
  }

  console.log("[MIDI Polyfill] Installed, isCapacitor:", isCapacitor);

  let midiHandler: ((event: MIDIMessageEvent) => void) | null = null;
  let capacitorPlugin: CapacitorMidiBridge | null = null;
  let nativeStarted = false;

  const startNativeIfNeeded = () => {
    if (nativeStarted) return;
    nativeStarted = true;
    console.log("[MIDI Polyfill] startNativeIfNeeded: fetching MidiBridge plugin...");
    getCapacitorPlugin()
      .then((plugin) => {
        console.log("[MIDI Polyfill] getCapacitorPlugin.then() ran, plugin:", !!plugin);
        if (!plugin) {
          console.error("[MIDI Polyfill] MidiBridge plugin NOT FOUND - registerPlugin('MidiBridge') returned null");
          return;
        }
        console.log("[MIDI Polyfill] MidiBridge plugin found, verifying with ping()...");
        const doRequestAccess = () => plugin.requestAccess();
        if (typeof plugin.ping === "function") {
          plugin
            .ping()
            .then((res) => {
              console.log("[MIDI Polyfill] MidiBridge ping OK:", res);
              return doRequestAccess();
            })
            .catch((err) => {
              console.error("[MIDI Polyfill] MidiBridge ping failed:", err);
              doRequestAccess();
            });
        } else {
          console.warn("[MIDI Polyfill] MidiBridge has no ping(), calling requestAccess directly");
          doRequestAccess();
        }
      })
      .catch((err) => {
        console.error("[MIDI Polyfill] startNativeIfNeeded promise chain failed:", err);
      })
      .finally(() => {
        console.log("[MIDI Polyfill] startNativeIfNeeded promise chain settled");
      });
  };

  let emitLogCount = 0;
  const emitMidiMessage = (packet: MidiPacket) => {
    emitLogCount++;
    if (emitLogCount <= 5) {
      console.warn("[MIDI Polyfill] emitMidiMessage #" + emitLogCount + ", midiHandler:", !!midiHandler, "packet:", packet);
    }
    if (!midiHandler) return;

    const normalized = normalizePacket(packet);
    if (!normalized) return;

    const syntheticEvent = {
      data: normalized,
      receivedTime: performance.now(),
      target: null,
      currentTarget: null,
      srcElement: null,
      type: "midimessage",
      bubbles: false,
      cancelBubble: false,
      cancelable: false,
      composed: false,
      defaultPrevented: false,
      eventPhase: Event.AT_TARGET,
      isTrusted: true,
      returnValue: true,
      timeStamp: performance.now(),
      composedPath: () => [],
      initEvent: () => {},
      preventDefault: () => {},
      stopImmediatePropagation: () => {},
      stopPropagation: () => {},
      NONE: Event.NONE,
      CAPTURING_PHASE: Event.CAPTURING_PHASE,
      AT_TARGET: Event.AT_TARGET,
      BUBBLING_PHASE: Event.BUBBLING_PHASE,
    } as unknown as MIDIMessageEvent;

    midiHandler(syntheticEvent);
  };

  let inputDisplayName = "No devices";
  const input: MIDIInput = {
    get name() {
      return inputDisplayName;
    },
    id: "ios-virtual-midi-input",
    manufacturer: "CoreMIDI",
    version: "1.0",
    type: "input",
    state: "connected",
    connection: "open",
    onmidimessage: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    open: async () => input,
    close: async () => input,
    onstatechange: null,
  } as MIDIInput;

  Object.defineProperty(input, "onmidimessage", {
    get: () => midiHandler,
    set: (value) => {
      midiHandler = value;
      if (value) {
        console.log("[MIDI Polyfill] onmidimessage setter called with handler");
        if (isCapacitor) {
          startNativeIfNeeded();
        }
      }
    },
    configurable: true,
  });

  const inputsMap = new Map<string, MIDIInput>();
  const midiAccess = {
    sysexEnabled: false,
    inputs: inputsMap,
    outputs: new Map(),
    onstatechange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  } as unknown as MIDIAccess;

  const onNativeMidiEvent = (event: Event) => {
    const customEvent = event as CustomEvent<{ data?: MidiPacket }>;
    if (!customEvent.detail?.data) return;
    emitMidiMessage(customEvent.detail.data);
  };

  scopedWindow.addEventListener(IOS_MIDI_EVENT_NAME, onNativeMidiEvent as EventListener);
  scopedWindow.__dispatchIOSMidiMessage = emitMidiMessage;

  const getCapacitorPlugin = async (): Promise<CapacitorMidiBridge | null> => {
    if (capacitorPlugin) {
      console.log("[MIDI Polyfill] getCapacitorPlugin: returning cached plugin");
      return capacitorPlugin;
    }
    if (!isCapacitor) {
      console.log("[MIDI Polyfill] getCapacitorPlugin: not Capacitor, skipping");
      return null;
    }
    try {
      console.log("[MIDI Polyfill] getCapacitorPlugin: importing @capacitor/core...");
      const { registerPlugin } = await import("@capacitor/core");
      console.log("[MIDI Polyfill] getCapacitorPlugin: registerPlugin('MidiBridge')...");
      capacitorPlugin = registerPlugin("MidiBridge") as CapacitorMidiBridge;
      return capacitorPlugin;
    } catch (err) {
      console.error("[MIDI Polyfill] getCapacitorPlugin failed:", err);
      return null;
    }
  };

  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    writable: true,
    value: async () => {
      const isCapacitorNow =
        !!scopedWindow.Capacitor?.isNativePlatform?.() ||
        (isCapacitorUrl && !!scopedWindow.Capacitor);

      if (webkitBridge && !isCapacitorNow) {
        webkitBridge.postMessage({ type: "midi/request-access" });
      }

      if (isCapacitorNow) {
        const plugin = await getCapacitorPlugin();
        if (!plugin) {
          inputDisplayName = "No devices";
          inputsMap.clear();
          return midiAccess;
        }
        const result = await plugin.requestAccess();
        const sources = result?.sources ?? [];
        nativeStarted = true;
        inputsMap.clear();
        if (sources.length >= 1) {
          inputDisplayName = sources[0];
          inputsMap.set(input.id, input);
        } else {
          inputDisplayName = "No devices";
        }
        return midiAccess;
      }

      inputDisplayName = "iPad USB MIDI";
      inputsMap.clear();
      inputsMap.set(input.id, input);
      return midiAccess;
    },
  });

  scopedWindow.addEventListener("beforeunload", () => {
    if (isCapacitor && capacitorPlugin) {
      capacitorPlugin.disconnect();
    } else if (webkitBridge) {
      webkitBridge.postMessage({ type: "midi/disconnect" });
    }
    scopedWindow.removeEventListener(IOS_MIDI_EVENT_NAME, onNativeMidiEvent as EventListener);
  });
};

installIosWebMidiPolyfill();

export { installIosWebMidiPolyfill };
