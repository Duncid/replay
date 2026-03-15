interface IosMidiBridgeMessage {
  type: "midi/request-access" | "midi/disconnect";
}

type MidiPacket = number[];

interface IosMidiBridgeHandler {
  postMessage: (message: IosMidiBridgeMessage) => void;
}

interface WindowWithIosBridge extends Window {
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
  const bridge = scopedWindow.webkit?.messageHandlers?.midiBridge;

  if (!bridge) {
    return;
  }

  let midiHandler: ((event: MIDIMessageEvent) => void) | null = null;

  const emitMidiMessage = (packet: MidiPacket) => {
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

  const input: MIDIInput = {
    id: "ios-virtual-midi-input",
    name: "iPad USB MIDI",
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
    },
    configurable: true,
  });

  const midiAccess = {
    sysexEnabled: false,
    inputs: new Map([[input.id, input]]),
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

  Object.defineProperty(navigator, "requestMIDIAccess", {
    configurable: true,
    writable: true,
    value: async () => {
      bridge.postMessage({ type: "midi/request-access" });
      return midiAccess;
    },
  });

  scopedWindow.addEventListener("beforeunload", () => {
    bridge.postMessage({ type: "midi/disconnect" });
    scopedWindow.removeEventListener(IOS_MIDI_EVENT_NAME, onNativeMidiEvent as EventListener);
  });
};

installIosWebMidiPolyfill();

export { installIosWebMidiPolyfill };
