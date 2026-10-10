import { expect, test } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

test.beforeEach(async ({ page }) => {
  // Keep browser checks independent of the user's live database.
  await page.route("**/*.supabase.co/**", route => route.request().method() === "GET"
    ? route.fulfill({ contentType: "application/json", body: "[]" })
    : route.abort());
});

test("production microphone worklet loads and delivers PCM", async ({ page }) => {
  await page.route("**/__test__/blank", route => route.fulfill({
    contentType: "text/html", body: '<button id="start">Start audio</button>',
  }));
  await page.goto("/__test__/blank");
  const file = readdirSync("dist/assets").find(name => name.startsWith("MicWorkletProcessor-") && name.endsWith(".js"));
  expect(file).toBeTruthy();
  await page.evaluate(async (url) => {
    const context = new AudioContext();
    await context.audioWorklet.addModule(url);
    const node = new AudioWorkletNode(context, "mic-worklet-processor", {
      processorOptions: { mode: "message", chunkSize: 256, sampleRate: context.sampleRate },
      numberOfOutputs: 0,
    });
    const oscillator = context.createOscillator();
    oscillator.connect(node);
    window["audioResult"] = new Promise(resolve => {
      node.port.onmessage = event => {
        // The first render quantum can be silent while the oscillator starts.
        if (event.data.type === "pcmChunk" && event.data.chunk.some((sample: number) => sample !== 0)) resolve({
          length: event.data.chunk.length,
          sampleRate: event.data.sampleRate,
          hasSignal: event.data.chunk.some((sample: number) => sample !== 0),
        });
      };
    });
    document.getElementById("start")!.onclick = () => {
      void context.resume();
      oscillator.start();
    };
    window["closeAudio"] = () => context.close();
  }, `/assets/${file}`);
  await page.locator("#start").click();
  const result = await page.evaluate(() => window["audioResult"]);
  expect(result).toMatchObject({ length: 256, hasSignal: true });
  await page.evaluate(() => window["closeAudio"]());
});

test("native MIDI connects, tracks hotplug, forwards notes, and closes", async ({ page }) => {
  await page.route("**/__test__/blank", route => route.fulfill({ contentType: "text/html", body: "MIDI test" }));
  await page.route("**/__test__/capacitor.js", route => route.fulfill({
    contentType: "text/javascript",
    body: readFileSync("node_modules/@capacitor/core/dist/index.js", "utf8"),
  }));
  await page.goto("/__test__/blank");
  await page.evaluate(() => {
    delete Object.getPrototypeOf(navigator).requestMIDIAccess;
    window["webkit"] = { messageHandlers: { bridge: {} } };
    window["nativeCalls"] = [];
    window["Capacitor"] = {
      isNativePlatform: () => true,
      PluginHeaders: [{ name: "MidiBridge", methods: ["ping", "requestAccess", "disconnect", "send"].map(name => ({ name, rtype: "promise" })) }],
      nativePromise: async (_plugin: string, method: string, options: unknown) => {
        window["nativeCalls"].push(method);
        if (method === "send") window["nativeSentMidi"] = options;
        return method === "requestAccess" ? {
          sources: ["Roland Digital Piano"], outputs: [{ id: "fp10-output", name: "Roland Digital Piano" }],
        } : {};
      },
    };
  });
  const source = readFileSync("src/lib/webMidiIosPolyfill.ts", "utf8")
    .replace('import("@capacitor/core")', 'import("/__test__/capacitor.js")');
  const script = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  await page.addScriptTag({ type: "module", content: script });
  await page.evaluate(async () => {
    const access = await navigator.requestMIDIAccess();
    const input = [...access.inputs.values()][0];
    window["midiAccess"] = access;
    window["midiInput"] = input;
    input.onmidimessage = event => { window["midiPacket"] = Array.from(event.data); };
  });
  await expect.poll(() => page.evaluate(() => window["midiInput"].name)).toBe("Roland Digital Piano");
  await page.evaluate(() => [...window["midiAccess"].outputs.values()][0].send([144, 60, 100]));
  await expect.poll(() => page.evaluate(() => window["nativeSentMidi"])).toEqual({ destination: "fp10-output", data: [144, 60, 100] });
  await page.evaluate(() => window["__dispatchIOSMidiSources"]([]));
  expect(await page.evaluate(() => window["midiAccess"].inputs.size)).toBe(0);
  await page.evaluate(() => {
    window["__dispatchIOSMidiSources"](["Roland Digital Piano"]);
    window["__dispatchIOSMidiMessageBatch"]([[144, 60, 100], [128, 60, 0]]);
  });
  expect(await page.evaluate(() => window["midiAccess"].inputs.size)).toBe(1);
  expect(await page.evaluate(() => window["midiPacket"])).toEqual([128, 60, 0]);
  await page.evaluate(() => window["midiInput"].close());
  expect(await page.evaluate(() => window["nativeCalls"])).toEqual(["requestAccess", "send", "disconnect"]);
});

test("on-demand AI loader retries failures and shares concurrent requests", async ({ page }) => {
  await page.route("**/__test__/blank", route => route.fulfill({ contentType: "text/html", body: "AI loader test" }));
  let requests = 0;
  await page.route("**/magentamusic.min.js", route => {
    requests += 1;
    return requests === 1 ? route.abort() : route.fulfill({
      contentType: "text/javascript", body: "window.mm = {};",
    });
  });
  await page.goto("/__test__/blank");
  const source = readFileSync("src/lib/magenta.ts", "utf8");
  const script = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  await page.addScriptTag({ type: "module", content: `${script}\nwindow.loadMagenta = loadMagentaScript;` });
  expect(await page.evaluate(() => window["loadMagenta"]().then(() => "loaded", () => "failed"))).toBe("failed");
  await page.evaluate(() => Promise.all([window["loadMagenta"](), window["loadMagenta"]()]));
  expect(requests).toBe(2);
});

test("app starts without loading AI scripts and fits a resized viewport", async ({ page, browserName }) => {
  const errors: string[] = [];
  const aiRequests: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("request", request => {
    if (request.url().includes("magentamusic.min.js")) aiRequests.push(request.url());
  });
  await page.goto("/");
  if (browserName === "webkit") {
    await expect(page.getByText("MIDI not supported in this browser")).toBeVisible();
  } else {
    await expect(page.getByRole("button", { name: "Connect MIDI" })).toBeVisible();
  }
  expect(aiRequests).toEqual([]);
  expect(errors).toEqual([]);
  await page.setViewportSize({ width: 820, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight)).toBe(true);
  await page.goto("/missing-page");
  await expect(page.getByRole("heading", { name: "404" })).toBeVisible();
});

test("notation and quest editor chunks load when their tabs open", async ({ page }) => {
  // Exercise a cold notation load: the notes container mounts after Suspense.
  await page.route("**/OpenSheetMusicDisplayView-*.js", async route => {
    await new Promise(resolve => setTimeout(resolve, 300));
    await route.continue();
  });
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/");
  const tabs = page.getByRole("tab");
  await expect(tabs).toHaveCount(4);
  expect(requests.some(url => /QuestEditor-.*\.js/.test(url))).toBe(false);
  expect(requests.some(url => /OpenSheetMusicDisplayView-.*\.js/.test(url))).toBe(false);
  expect(requests.some(url => /(?:teacher|tune\.ns|SheetMusicRenderer)-.*\.js/.test(url))).toBe(false);
  const key = page.getByRole("button", { name: "C4", exact: true });
  expect(await key.evaluate(element => element.getBoundingClientRect().width)).toBeGreaterThan(10);
  await tabs.nth(2).click();
  await expect.poll(() => requests.some(url => /QuestEditor-.*\.js/.test(url))).toBe(true);
  await expect(page.getByText("Loading editor...", { exact: true })).toBeHidden();
  await tabs.nth(3).click();
  await expect.poll(() => requests.some(url => /OpenSheetMusicDisplayView-.*\.js/.test(url))).toBe(true);
  await expect(page.getByText("Loading notation...", { exact: true })).toBeHidden();
  await expect.poll(() => requests.some(url => /teacher-.*\.js/.test(url))).toBe(true);
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled();
  await expect(page.locator("canvas")).toBeVisible();
  await expect.poll(() => page.locator("canvas").evaluate(canvas => canvas.width)).toBeGreaterThan(100);
  const canvas = page.locator("canvas");
  // Initial sizing must work without a window resize or device rotation.
  await expect.poll(() => canvas.evaluate(element => {
    const parent = element.parentElement!.parentElement!;
    const bounds = parent.getBoundingClientRect();
    return Math.abs(element.clientWidth - bounds.width) < 2 &&
      Math.abs(element.clientHeight - bounds.height) < 2;
  })).toBe(true);
  const beforePlayback = await canvas.screenshot();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeVisible();
  await expect.poll(async () => (await canvas.screenshot()).equals(beforePlayback)).toBe(false);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
  expect(errors).toEqual([]);
  await page.screenshot({ path: `/tmp/replay-modern-${test.info().project.name}.png` });
});

test("keyboard sound preference mutes MIDI audio while keeping input and screen audio", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("replay-instrument", JSON.stringify("classic"));
    const input = { id: "test-piano", name: "Test Piano", manufacturer: "Test", onmidimessage: null, close: async () => {} };
    window["testMidiInput"] = input;
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true,
      value: async () => ({ inputs: new Map([[input.id, input]]), outputs: new Map() }),
    });
    window["pianoStarts"] = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) {
      if (this.type === "triangle") window["pianoStarts"] += 1;
      return start.apply(this, args);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect MIDI" }).click();
  await page.getByRole("button", { name: "MIDI settings" }).click();
  const preference = page.getByRole("switch", { name: "Silent while I play" });
  await expect(preference).not.toBeChecked();
  await preference.click();
  const key = page.getByRole("button", { name: "C4", exact: true });
  await page.evaluate(() => window["testMidiInput"].onmidimessage({ data: [144, 60, 100] }));
  await expect(key).toHaveClass(/bg-red-500|bg-blue-500/);
  expect(await page.evaluate(() => window["pianoStarts"])).toBe(0);
  await page.evaluate(() => window["testMidiInput"].onmidimessage({ data: [128, 60, 0] }));
  await key.dispatchEvent("mousedown");
  await expect.poll(() => page.evaluate(() => window["pianoStarts"])).toBe(1);
  await key.dispatchEvent("mouseup");
  await preference.click();
  await page.evaluate(() => window["testMidiInput"].onmidimessage({ data: [144, 60, 100] }));
  await expect.poll(() => page.evaluate(() => window["pianoStarts"])).toBe(2);
  await page.evaluate(() => window["testMidiInput"].onmidimessage({ data: [128, 60, 0] }));
  await preference.click();
  await page.reload();
  await page.getByRole("button", { name: "Connect MIDI" }).click();
  await page.getByRole("button", { name: "MIDI settings" }).click();
  await expect(preference).toBeChecked();
});

test("MIDI model recognition distinguishes controllers, variants, and unknown names", async ({ page }) => {
  await page.route("**/__test__/blank", route => route.fulfill({ contentType: "text/html", body: "Model test" }));
  await page.goto("/__test__/blank");
  const source = readFileSync("src/utils/midiDeviceProfiles.ts", "utf8");
  const script = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  await page.addScriptTag({ type: "module", content: `${script}\nwindow.recognize = recognizeMidiDevice; window.preferenceKey = midiSoundPreferenceKey;` });
  const results = await page.evaluate(() => {
    const device = (name: string, manufacturer = "CoreMIDI") => ({ name, manufacturer });
    return {
      fp10: window["recognize"](device("FP-10 MIDI 1"))?.hasOwnSound,
      fp30x: window["recognize"](device("Roland FP30X"))?.hasOwnSound,
      yamaha: window["recognize"](device("P-145"))?.hasOwnSound,
      korg: window["recognize"](device("B2", "KORG"))?.hasOwnSound,
      controller: window["recognize"](device("MPK mini 3"))?.hasOwnSound,
      play: window["recognize"](device("MPK mini Play"))?.hasOwnSound,
      play3: window["recognize"](device("MPK mini Play mk3"))?.model,
      unknown: window["recognize"](device("Roland Digital Piano")),
      ambiguous: window["recognize"](device("B2")),
      otherVariant: window["recognize"](device("FP-10X")),
      stableKey: window["preferenceKey"](device("FP-10")) === window["preferenceKey"](device("Roland FP10 MIDI 1", "Roland")),
    };
  });
  expect(results).toEqual({ fp10: true, fp30x: true, yamaha: true, korg: true, controller: false, play: true,
    play3: "MPK mini Play mk3", unknown: null, ambiguous: null, otherVariant: null, stableKey: true });
});

test("MIDI popover settings are manual and remembered per keyboard", async ({ page }) => {
  await page.addInitScript(() => {
    const input = { id: "native-source", name: "FP-10", manufacturer: "CoreMIDI", onmidimessage: null, close: async () => {} };
    window["testMidiInput"] = input;
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true, value: async () => ({ inputs: new Map([[input.id, input]]), outputs: new Map() }),
    });
  });
  await page.goto("/");
  const connect = page.getByRole("button", { name: "Connect MIDI" });
  const disconnect = page.getByRole("button", { name: "Disconnect", exact: true });
  const menu = page.getByRole("button", { name: "MIDI settings" });
  const silent = page.getByRole("switch", { name: "Silent while I play" });
  await connect.click();
  await expect(silent).toBeHidden();
  await menu.click();
  await expect(silent).not.toBeChecked();
  await expect(page.getByRole("switch", { name: "Play on keyboard" })).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  await page.screenshot({ path: `/tmp/replay-midi-menu-${test.info().project.name}.png` });
  await silent.click();
  await page.keyboard.press("Escape");
  await disconnect.click();
  await page.evaluate(() => { window["testMidiInput"].name = "MPK mini 3"; });
  await connect.click();
  await menu.click();
  await expect(silent).not.toBeChecked();
  await page.keyboard.press("Escape");
  await disconnect.click();
  await page.evaluate(() => { window["testMidiInput"].name = "Roland FP10 MIDI 1"; });
  await connect.click();
  await menu.click();
  await expect(silent).toBeChecked();
  await page.reload();
  await connect.click();
  await menu.click();
  await expect(silent).toBeChecked();
});

test("keyboard output sends notes without echoing physical keys and releases on disable", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("replay-instrument", JSON.stringify("classic"));
    const input = { id: "fp10", name: "FP-10", manufacturer: "Roland", onmidimessage: null, close: async () => {} };
    window["testMidiInput"] = input;
    window["sentMidi"] = [];
    const output = { id: "fp10-out", name: "FP-10", state: "connected", send: data => window["sentMidi"].push(Array.from(data)) };
    Object.defineProperty(navigator, "requestMIDIAccess", {
      configurable: true, value: async () => ({ inputs: new Map([[input.id, input]]), outputs: new Map([[output.id, output]]) }),
    });
    window["pianoStarts"] = 0;
    const start = OscillatorNode.prototype.start;
    OscillatorNode.prototype.start = function (...args) {
      if (this.type === "triangle") window["pianoStarts"]++;
      return start.apply(this, args);
    };
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Connect MIDI" }).click();
  await page.getByRole("button", { name: "MIDI settings" }).click();
  const output = page.getByRole("switch", { name: "Play on keyboard" });
  await output.click();
  await page.getByRole("switch", { name: "Silent while I play" }).click();
  await page.evaluate(() => window["testMidiInput"].onmidimessage({ data: [144, 60, 100] }));
  expect(await page.evaluate(() => window["sentMidi"])).toEqual([]);
  await page.evaluate(() => window["testMidiInput"].onmidimessage({ data: [128, 60, 0] }));
  const key = page.getByRole("button", { name: "C4", exact: true });
  await key.dispatchEvent("mousedown");
  await expect.poll(() => page.evaluate(() => window["sentMidi"])).toEqual([[144, 60, 100]]);
  expect(await page.evaluate(() => window["pianoStarts"])).toBe(0);
  await output.click();
  await expect.poll(() => page.evaluate(() => window["sentMidi"])).toEqual([[144, 60, 100], [128, 60, 0]]);
  await key.dispatchEvent("mouseup");
  await key.dispatchEvent("mousedown");
  await expect.poll(() => page.evaluate(() => window["pianoStarts"])).toBe(1);
  await key.dispatchEvent("mouseup");
  await output.click();
  await page.keyboard.press("Escape");
  await page.evaluate(() => { window["sentMidi"] = []; });
  await page.getByRole("tab").nth(3).click();
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window["sentMidi"].some(message => message[0] === 144))).toBe(true);
  expect(await page.evaluate(() => window["pianoStarts"])).toBe(1);
  await page.getByRole("button", { name: "Pause", exact: true }).click();
});

for (const sampleState of ["loading", "failed"] as const) {
  test(`visible keyboard plays on its first touch while samples are ${sampleState}`, async ({ page, browserName }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.addInitScript(() => {
      localStorage.setItem("replay-instrument", JSON.stringify("acoustic-piano"));
      // Exercise the native-iPad startup path that used to display the overlay.
      window["Capacitor"] = { isNativePlatform: () => true };
      Object.defineProperty(navigator, "requestMIDIAccess", {
        configurable: true, value: async () => ({ inputs: new Map(), outputs: new Map() }),
      });
      window["pianoStarts"] = 0;
      const start = OscillatorNode.prototype.start;
      OscillatorNode.prototype.start = function (...args) {
        if (this.type === "triangle") window["pianoStarts"]++;
        return start.apply(this, args);
      };
      window["resumedContexts"] = new Set<AudioContext>();
      const resume = AudioContext.prototype.resume;
      AudioContext.prototype.resume = function () {
        window["resumedContexts"].add(this);
        return resume.call(this);
      };
    });
    let finish: () => void;
    const held = new Promise<void>(resolve => { finish = resolve; });
    await page.route("**/tonejs-instruments/samples/**", async route => {
      if (sampleState === "loading") await held;
      await route.abort();
    });
    try {
      await page.goto("/");
      const key = page.getByRole("button", { name: "C4", exact: true });
      await expect(key).toBeEnabled();
      await expect(page.getByRole("button", { name: "Tap to enable sound" })).toHaveCount(0);
      if (browserName === "webkit") await key.tap();
      else await key.click();
      await expect.poll(() => page.evaluate(() => window["pianoStarts"])).toBe(1);
      await expect(key).not.toHaveClass(/bg-red-500|bg-blue-500/);
      await expect.poll(() => page.evaluate(() => [...window["resumedContexts"]].every(context => context.state === "running"))).toBe(true);
      // Simulate audio suspension while the keyboard stays visible.
      await page.evaluate(() => Promise.all([...window["resumedContexts"]].map(context => context.suspend())));
      // A subsequent touch works too; no second activation tap is needed.
      if (browserName === "webkit") await key.tap();
      else await key.click();
      await expect.poll(() => page.evaluate(() => window["pianoStarts"])).toBe(2);
      await expect.poll(() => page.evaluate(() => [...window["resumedContexts"]].every(context => context.state === "running"))).toBe(true);
      expect(errors).toEqual([]);
    } finally { finish!(); }
  });
}
