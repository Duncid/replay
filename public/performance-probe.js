// Opt-in physical-device probe; injected only for DEBUG --replay-performance launches.
(() => {
  const report = result => window.webkit.messageHandlers.replayPerformance.postMessage(result);
  const waitFor = async predicate => {
    const deadline = performance.now() + 30000;
    while (performance.now() < deadline) {
      const value = predicate();
      if (value) return value;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error("Timed out waiting for app readiness");
  };
  const frame = () => new Promise(requestAnimationFrame);
  const savedMode = localStorage.getItem("replay-active-mode");
  // A repeatable startup screen, restored before the probe ends.
  localStorage.setItem("replay-active-mode", JSON.stringify("play"));
  const restore = () => savedMode === null
    ? localStorage.removeItem("replay-active-mode")
    : localStorage.setItem("replay-active-mode", savedMode);
  const run = async () => {
    await waitFor(() => document.querySelectorAll('[role="tab"]').length === 4 && document.querySelector("button.touch-none"));
    await frame();
    await frame();
    restore();
    report({ phase: "startup", webReadyMs: performance.now() });
    const start = performance.now();
    document.querySelectorAll('[role="tab"]')[3].dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    const play = await waitFor(() => [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Play" && !button.disabled));
    await waitFor(() => document.querySelector("canvas")?.width > 100);
    await frame();
    await frame();
    restore();
    report({ phase: "tune-ready", elapsedMs: performance.now() - start });
    play.click();
    await waitFor(() => [...document.querySelectorAll("button")].some(button => button.textContent.trim() === "Pause"));
    const intervals = [];
    const until = performance.now() + 8000;
    let previous = await frame();
    while (performance.now() < until) {
      const now = await frame();
      intervals.push(now - previous);
      previous = now;
    }
    const pause = [...document.querySelectorAll("button")].find(button => button.textContent.trim() === "Pause");
    pause?.click();
    const sorted = [...intervals].sort((a, b) => a - b);
    const percentile = fraction => sorted[Math.floor((sorted.length - 1) * fraction)];
    report({ phase: "playback-frames", frames: intervals.length, medianMs: percentile(0.5), p95Ms: percentile(0.95), p99Ms: percentile(0.99), over50Ms: intervals.filter(ms => ms > 50).length });
    restore();
    report({ phase: "complete" });
  };
  run().catch(error => { restore(); report({ phase: "error", message: error.message }); });
})();
