// Opt-in only: DEBUG iPad launch injection or the explicit Playwright perf suite.
// No cloud data is read/written. Normal launches never execute this file.
(() => {
  const config = { notes: 200, full: false, seconds: 8, ...window.__replayPerformanceConfig };
  const report = result => {
    const record = { schema: 2, platform: "web", ...config, ...result };
    window.__replayPerformanceResults ??= [];
    window.__replayPerformanceResults.push(record);
    window.webkit?.messageHandlers?.replayPerformance?.postMessage(record);
  };
  const originalFetch = window.fetch;
  const originalRAF = window.requestAnimationFrame;
  const originalStart = OscillatorNode.prototype.start;
  const saved = new Map(["replay-active-mode", "replay-instrument"].map(key => [key, localStorage.getItem(key)]));
  const restore = () => {
    for (const [key, value] of saved) value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value);
    // Keep fixture network isolation until reload, even after sampling completes.
    window.requestAnimationFrame = originalRAF;
    OscillatorNode.prototype.start = originalStart;
    readiness.disconnect(); observer?.disconnect();
  };
  const waitFor = async (predicate, label) => {
    const deadline = performance.now() + 45000;
    while (performance.now() < deadline) {
      if (document.hidden) throw new Error("Keep the app foregrounded and the device awake");
      const value = predicate();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 16));
    }
    throw new Error(`Timed out: ${label}`);
  };
  const frame = () => new Promise(resolve => originalRAF.call(window, resolve));
  const quantile = (values, p) => {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted.length ? sorted[Math.floor((sorted.length - 1) * p)] : null;
  };
  const notes = Array.from({ length: config.notes }, (_, i) => ({
    pitch: 48 + i % 25, startTime: Math.floor(i / 2) * .25,
    endTime: Math.floor(i / 2) * .25 + .2, velocity: 90,
  }));
  const sequence = { notes, totalTime: Math.ceil(config.notes / 2) * .25 };
  // Fixtures exercise the real library -> coach -> demo -> highway path.
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
    let data;
    if (url.pathname.includes("/rest/v1/")) {
      data = url.pathname.endsWith("/tune_assets") ? [{ tune_key: "performance-fixture", note_sequence: sequence, briefing: null }] : [];
    } else if (url.pathname.endsWith("/functions/v1/tune-coach")) {
      data = { tuneTitle: "Performance fixture", practicePlan: [{ itemId: "performance", itemType: "nugget", instruction: "Deterministic performance measurement", nugget: { noteSequence: sequence } }] };
    } else if (url.pathname.includes("/functions/v1/")) {
      throw new Error(`Unexpected cloud call during probe: ${url.pathname}`);
    } else return originalFetch.call(window, input, init);
    return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  localStorage.setItem("replay-active-mode", JSON.stringify("learn"));
  localStorage.setItem("replay-instrument", JSON.stringify("classic"));
  const audio = [], frameWork = new Map(), longTasks = [];
  let collecting = false, sceneReadyAt = null, selectedAt = null, observer;
  const readiness = new MutationObserver(() => {
    if (document.querySelector('.note-highway[data-render-ready="true"]') && sceneReadyAt === null) sceneReadyAt = performance.now();
  });
  readiness.observe(document, { subtree: true, attributes: true, attributeFilter: ["data-render-ready"] });
  OscillatorNode.prototype.start = function (...args) {
    if (this.type === "triangle") audio.push({ wallMs: performance.now(), audioTime: Math.max(args[0] ?? 0, this.context.currentTime), state: this.context.state });
    return originalStart.apply(this, args);
  };
  window.requestAnimationFrame = callback => originalRAF.call(window, time => {
    const start = performance.now();
    try { callback(time); } finally {
      if (collecting) frameWork.set(time, (frameWork.get(time) ?? 0) + performance.now() - start);
    }
  });
  const run = async () => {
    if (![200, 1000, 5000].includes(config.notes) || config.seconds < 2 || config.seconds > 20) throw new Error("Unsupported probe workload");
    const tune = await waitFor(() => document.querySelector('button[aria-label="Practice: Performance Fixture"]'), "tune library");
    await frame(); await frame();
    report({ phase: "startup", webReadyMs: performance.now(), viewport: [innerWidth, innerHeight], devicePixelRatio, userAgent: navigator.userAgent, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
    if (config.full) {
      const toggle = document.querySelector('#full-keyboard');
      if (!toggle) throw new Error("Full-keyboard control missing");
      if (toggle.getAttribute('aria-checked') !== 'true') toggle.click();
      await frame(); await frame();
    }
    selectedAt = performance.now();
    // Browser tests supply a trusted click. WKWebView debug launches use this click.
    if (!window.__replayPerformanceManualStart) tune.click();
    await waitFor(() => sceneReadyAt, "presented highway");
    report({ phase: "tune-ready", elapsedMs: sceneReadyAt - selectedAt });
    await waitFor(() => audio.length && audio[0].state === "running", "running audio context and first demo note");
    report({ phase: "audio-start", sceneToAudioMs: audio[0].wallMs - sceneReadyAt, selectionToAudioMs: audio[0].wallMs - selectedAt });
    if (PerformanceObserver.supportedEntryTypes.includes("longtask")) {
      observer = new PerformanceObserver(list => longTasks.push(...list.getEntries().map(entry => entry.duration)));
      observer.observe({ type: "longtask" });
    }
    const gaps = [];
    let previous = await frame(), start = previous;
    collecting = true;
    while (previous - start < config.seconds * 1000) {
      if (document.hidden) throw new Error("App backgrounded during sample");
      const now = await frame(); gaps.push(now - previous); previous = now;
    }
    collecting = false;
    const canvas = document.querySelector('.note-highway canvas');
    const audioErrors = audio.map((event, i) => Math.abs(event.audioTime - audio[0].audioTime - notes[i].startTime) * 1000);
    report({ phase: "playback", frames: gaps.length, elapsedMs: previous - start, fps: gaps.length * 1000 / (previous - start),
      frameP50Ms: quantile(gaps, .5), frameP95Ms: quantile(gaps, .95), frameP99Ms: quantile(gaps, .99), maxFrameMs: Math.max(...gaps),
      over25Ms: gaps.filter(ms => ms > 25).length, over50Ms: gaps.filter(ms => ms > 50).length,
      rafWorkP95Ms: quantile([...frameWork.values()], .95), longTasks: observer ? longTasks.length : null,
      backingPixels: [canvas.width, canvas.height], keyCount: document.querySelectorAll('.piano-key').length,
      audioNotes: audio.length, relativeAudioScheduleErrorP95Ms: quantile(audioErrors, .95), maxRelativeAudioScheduleErrorMs: Math.max(...audioErrors),
      jsHeapBytes: performance.memory?.usedJSHeapSize ?? null });
    [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Restart')?.click();
    await frame(); await frame();
    restore(); report({ phase: "complete" });
  };
  run().catch(error => { collecting = false; restore(); report({ phase: "error", message: error.message }); });
})();
