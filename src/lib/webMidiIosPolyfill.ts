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
  let getPluginPromise: Promise<CapacitorMidiBridge | null> | null = null;
  let nativeStarted = false;

  const REQUEST_ACCESS_TIMEOUT_MS = 5000;

  const applyNativeResult = (sources: string[]) => {
    inputsMap.clear();
    if (sources.length >= 1) {
      inputDisplayName = sources[0];
      inputsMap.set(input.id, input);
    } else {
      inputDisplayName = "No devices";
    }
    scopedWindow.dispatchEvent(new CustomEvent("midi-sources-updated"));
  };

  const startNativeIfNeeded = () => {
    if (nativeStarted) return;

    const doRequestAccess = (plugin: CapacitorMidiBridge) => {
      nativeStarted = true;
      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        nativeStarted = false;
        inputDisplayName = "No devices";
        inputsMap.clear();
        scopedWindow.dispatchEvent(new CustomEvent("midi-sources-updated"));
      }, REQUEST_ACCESS_TIMEOUT_MS);

      plugin
        .requestAccess()
        .then((result) => {
          if (timedOut) return;
          clearTimeout(timeoutId);
          const sources = result?.sources ?? [];
          applyNativeResult(sources);
        })
        .catch((err) => {
          if (timedOut) return;
          clearTimeout(timeoutId);
          nativeStarted = false;
          inputDisplayName = "No devices";
          inputsMap.clear();
          scopedWindow.dispatchEvent(new CustomEvent("midi-sources-updated"));
        });
    };

    if (capacitorPlugin) {
      setTimeout(() => {
        if (nativeStarted) return;
        doRequestAccess(capacitorPlugin!);
      }, 50);
      return;
    }

    getCapacitorPlugin()
      .then((plugin) => {
        if (!plugin) {
          nativeStarted = false;
          inputDisplayName = "No devices";
          inputsMap.clear();
          scopedWindow.dispatchEvent(new CustomEvent("midi-sources-updated"));
          return;
        }
        doRequestAccess(plugin);
      })
      .catch(() => {
        nativeStarted = false;
        inputDisplayName = "No devices";
        inputsMap.clear();
        scopedWindow.dispatchEvent(new CustomEvent("midi-sources-updated"));
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
      console.log("[MIDI Polyfill] [DEBUG] onmidimessage SETTER called, value:", !!value);
      midiHandler = value;
      if (value) {
        console.log("[MIDI Polyfill] [DEBUG] onmidimessage: scheduling startNativeIfNeeded in 150ms");
        setTimeout(() => {
          console.log("[MIDI Polyfill] [DEBUG] onmidimessage: setTimeout fired, calling startNativeIfNeeded");
          startNativeIfNeeded();
        }, 150);
      } else {
        console.log("[MIDI Polyfill] [DEBUG] onmidimessage: cleared, nativeStarted=false");
        nativeStarted = false;
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

  const getCapacitorPlugin = (): Promise<CapacitorMidiBridge | null> => {
    console.log("[MIDI Polyfill] [DEBUG] getCapacitorPlugin ENTRY");
    if (capacitorPlugin) {
      console.log("[MIDI Polyfill] [DEBUG] getCapacitorPlugin: returning CACHED plugin (deferred to next tick)");
      // WKWebView on iOS can drop microtasks when returning sync from async.
      // Defer to next macrotask so .then() callbacks reliably run.
      return new Promise((resolve) => setTimeout(() => resolve(capacitorPlugin), 0));
    }
    if (!isCapacitor) {
      console.log("[MIDI Polyfill] [DEBUG] getCapacitorPlugin: not Capacitor, return null");
      return Promise.resolve(null);
    }
    if (getPluginPromise) {
      console.log("[MIDI Polyfill] [DEBUG] getCapacitorPlugin: reusing in-flight promise");
      return getPluginPromise;
    }
    getPluginPromise = (async (): Promise<CapacitorMidiBridge | null> => {
      try {
        console.log("[MIDI Polyfill] [DEBUG] getCapacitorPlugin: await import('@capacitor/core')...");
        const mod = await import("@capacitor/core");
        console.log("[MIDI Polyfill] [DEBUG] getCapacitorPlugin: import DONE, registerPlugin:", !!mod.registerPlugin);
        const { registerPlugin } = mod;
        console.log("[MIDI Polyfill] [DEBUG] getCapacitorPlugin: calling registerPlugin('MidiBridge')...");
        capacitorPlugin = registerPlugin("MidiBridge") as CapacitorMidiBridge;
        console.log("[MIDI Polyfill] [DEBUG] getCapacitorPlugin: registerPlugin DONE, plugin:", !!capacitorPlugin);
        return capacitorPlugin;
      } catch (err) {
        console.error("[MIDI Polyfill] [DEBUG] getCapacitorPlugin FAILED:", err);
        if (capacitorPlugin) return capacitorPlugin;
        return null;
      } finally {
        getPluginPromise = null;
      }
    })();
    return getPluginPromise;
  };

  if (isCapacitor) {
    console.log("[MIDI Polyfill] [DEBUG] scheduling pre-warm in 2500ms");
    setTimeout(() => {
      console.log("[MIDI Polyfill] [DEBUG] pre-warm: starting getCapacitorPlugin()");
      getCapacitorPlugin()
        .then((plugin) => {
          if (plugin) console.log("[MIDI Polyfill] [DEBUG] pre-warm: SUCCESS, plugin cached");
          else console.log("[MIDI Polyfill] [DEBUG] pre-warm: plugin is null");
        })
        .catch((err) => {
          console.error("[MIDI Polyfill] [DEBUG] pre-warm: FAILED", err);
        });
    }, 2500);
  }

  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    writable: true,
    value: async () => {
      console.log("[MIDI Polyfill] [DEBUG] requestMIDIAccess ENTRY");
      const isCapacitorNow =
        !!scopedWindow.Capacitor?.isNativePlatform?.() ||
        (isCapacitorUrl && !!scopedWindow.Capacitor);
      console.log("[MIDI Polyfill] [DEBUG] requestMIDIAccess: isCapacitorNow:", isCapacitorNow);

      if (webkitBridge && !isCapacitorNow) {
        console.log("[MIDI Polyfill] [DEBUG] requestMIDIAccess: using webkit bridge");
        webkitBridge.postMessage({ type: "midi/request-access" });
      }

      if (isCapacitorNow) {
        console.log("[MIDI Polyfill] [DEBUG] requestMIDIAccess: returning midiAccess (Capacitor path)");
        inputDisplayName = "Connecting...";
        inputsMap.clear();
        inputsMap.set(input.id, input);
        return midiAccess;
      }

      console.log("[MIDI Polyfill] [DEBUG] requestMIDIAccess: returning midiAccess (webkit path)");
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
