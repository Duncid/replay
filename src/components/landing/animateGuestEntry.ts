/** Retain the live canvas; only the inert DOM keys get a temporary flight layer. */
export function animateGuestEntry(source: HTMLElement, destination: HTMLElement, simple: boolean) {
  const animations: Animation[] = [];
  const restores: (() => void)[] = [];
  let flight: HTMLElement | undefined;
  let cancelled = false;
  const ease = "cubic-bezier(.22,.75,.25,1)";
  const animate = (element: Element, frames: Keyframe[], duration: number, delay = 0) => {
    const animation = element.animate(frames, { duration, delay, easing: ease, fill: "both" });
    animations.push(animation);
    return animation.finished.catch(() => {});
  };
  const style = (element: HTMLElement, values: Partial<CSSStyleDeclaration>) => {
    const original = element.getAttribute("style");
    restores.push(() => original === null ? element.removeAttribute("style") : element.setAttribute("style", original));
    Object.assign(element.style, values);
  };
  const ipad = source.querySelector<HTMLElement>(".landing-ipad");
  const screen = source.querySelector<HTMLElement>(".landing-ipad-screen");
  const keys = source.querySelector<HTMLElement>("[data-preview-keys]");
  const target = destination.querySelector<HTMLElement>("[data-piano-keys]");
  const usable = (element: HTMLElement | null) => element && element.getBoundingClientRect().width > 0 && element.getBoundingClientRect().height > 0;
  const run = async () => {
    if (simple || !usable(ipad) || !usable(screen) || !usable(keys) || !usable(target) || !source.animate) {
      await Promise.all([
        animate(source, [{ opacity: 1 }, { opacity: 0 }], 120),
        animate(destination, [{ opacity: 0 }, { opacity: 1 }], 120),
      ]);
      return;
    }
    const tilt = getComputedStyle(ipad!).transform;
    style(ipad!, { transition: "none", transform: tilt });
    source.querySelectorAll(".landing-header, .landing-intro, figcaption, .landing-features, .landing-cta, .landing-ipad-shadow, .landing-ipad-glass, .landing-demo-header, .landing-demo-title, .landing-demo-toolbar, .landing-demo-progress, .note-rail")
      .forEach(element => { void animate(element, [{ opacity: 1 }, { opacity: 0 }], 200); });
    // Straighten first, then measure the unprojected keyboard for the flight.
    await animate(ipad!, [{ transform: tilt }, { transform: "none" }], 200);
    if (cancelled) return;
    const start = keys!.getBoundingClientRect();
    const end = target!.getBoundingClientRect();
    const screenBox = screen!.getBoundingClientRect();
    const tabletBox = ipad!.getBoundingClientRect();
    const sx = window.innerWidth / screenBox.width;
    const sy = window.innerHeight / screenBox.height;
    const tx = -tabletBox.left - (screenBox.left - tabletBox.left) * sx;
    const ty = -tabletBox.top - (screenBox.top - tabletBox.top) * sy;
    style(ipad!, { transformOrigin: "0 0" });

    flight = document.createElement("div");
    flight.className = "guest-entry-key-flight";
    flight.setAttribute("aria-hidden", "true");
    flight.inert = true;
    Object.assign(flight.style, { width: `${keys!.offsetWidth}px`, height: `${keys!.offsetHeight}px` });
    const copy = keys!.cloneNode(true) as HTMLElement;
    copy.removeAttribute("data-preview-keys");
    Object.assign(copy.style, { position: "absolute", inset: "0", width: "100%", height: "100%" });
    copy.querySelectorAll("[id]").forEach(element => element.removeAttribute("id"));
    flight.append(copy);
    source.parentElement!.append(flight);
    style(keys!, { opacity: "0" });
    const keyTransform = (rect: DOMRect) => `translate(${rect.left}px, ${rect.top}px) scale(${rect.width / keys!.offsetWidth}, ${rect.height / keys!.offsetHeight})`;
    const travel = 520;
    const reveal = travel + 60; // Let the keys settle before blending into the real keyboard.
    const blend = 180;
    void animate(flight, [{ transform: keyTransform(start) }, { transform: keyTransform(end) }], travel);
    void animate(flight, [{ opacity: 1 }, { opacity: 0 }], blend, reveal);
    void animate(ipad!, [{ transform: "none" }, { transform: `translate(${tx}px, ${ty}px) scale(${sx}, ${sy})` }], travel);
    void animate(screen!, [{ borderRadius: getComputedStyle(screen!).borderRadius }, { borderRadius: "0" }], 440);
    const highway = source.querySelector(".landing-demo-highway");
    if (highway) void animate(highway, [{ opacity: 1 }, { opacity: 0 }], 300);
    await Promise.all([
      animate(source, [{ opacity: 1 }, { opacity: 0 }], blend, reveal),
      animate(destination, [{ opacity: 0 }, { opacity: 1 }], blend, reveal),
    ]);
  };
  return {
    finished: run(),
    cancel: () => {
      cancelled = true;
      animations.forEach(animation => animation.cancel());
      flight?.remove();
      restores.reverse().forEach(restore => restore());
    },
  };
}
