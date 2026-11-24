import type { SceneReadiness } from "@/lib/practiceSceneReadiness";
import { useEffect, useLayoutEffect, useRef } from "react";
import { Application, Container, Graphics, Text } from "pixi.js";
import { createPianoLayout, pianoKeyGeometry } from "../pianoLayout";
import { highwayState, nextHighwayNotes, type HighwayNote, type HighwayTransport } from "./model";

/** Raise the hit line above the keyboard so notes visibly cross it. */
const HIT_LINE_INSET = 40;

export interface NoteHighwayProps {
  /** Covered pixels below the musical hit line; never part of approach timing. */
  bottomOcclusion?: number;
  notes: HighwayNote[];
  transport: HighwayTransport;
  fullKeyboard?: boolean;
  range?: [number, number];
  pixelsPerBeat?: number;
  beatsPerSecond?: number;
  onReadinessChange?: (status: SceneReadiness) => void;
  onArmedChange?: (pitches: number[]) => void;
}
/** Musical state is supplied by the engine. Pixi owns the animation, never React. */
export function NoteHighway({ bottomOcclusion = 0, notes, transport, fullKeyboard = false, range, pixelsPerBeat = 72, beatsPerSecond = 2, onArmedChange, onReadinessChange }: NoteHighwayProps) {
  const rangeLow = range?.[0], rangeHigh = range?.[1];
  const host = useRef<HTMLDivElement>(null);
  const announcement = useRef<HTMLSpanElement>(null);
  const live = useRef({ transport, onArmedChange, onReadinessChange });
  live.current = { transport, onArmedChange, onReadinessChange };
  useLayoutEffect(() => {
    if (host.current) host.current.dataset.renderReady = "false";
    live.current.onReadinessChange?.("loading");
    return () => live.current.onReadinessChange?.("loading");
  }, [notes, fullKeyboard, rangeLow, rangeHigh, pixelsPerBeat, beatsPerSecond, bottomOcclusion]);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false, frameId = 0, readyFrameId = 0;
    const app = new Application();
    let observer: ResizeObserver | undefined;
    let motionCleanup: (() => void) | undefined;
    let themeObserver: MutationObserver | undefined;
    void app.init({ autoStart: false, preference: "webgl", backgroundAlpha: 0, antialias: true, resolution: Math.min(devicePixelRatio, 2), autoDensity: true }).then(() => {
      if (disposed) { app.destroy(true, { children: true }); return; }
      element.prepend(app.canvas);
      app.canvas.setAttribute("aria-hidden", "true");
      const reduced = matchMedia("(prefers-reduced-motion: reduce)");
      const layout = createPianoLayout(fullKeyboard);
      const columns = new Graphics(), lines = new Graphics(), line = new Graphics(), veil = new Graphics();
      const layer = new Container(), mask = new Graphics();
      layer.mask = mask;
      app.stage.addChild(columns, lines, line, layer, veil, mask);
      const color = (token: string) => {
        const probe = document.createElement("span");
        probe.style.color = `hsl(var(--${token}))`; element.append(probe);
        const value = getComputedStyle(probe).color; probe.remove(); return value;
      };
      let ink = color("foreground"), background = color("background"), surface = color("card"), border = color("border"), muted = color("muted-foreground"), accent = color("primary");
      const pitchColors = ["c", "c", "d", "d", "e", "f", "f", "g", "g", "a", "a", "b"].map(n => color(`note-${n}`));
      let geometry = new Map(layout.notes.map(n => { const g = pianoKeyGeometry(layout, 1, n); return [g.midi, g]; }));
      const octaveLabels = layout.whiteKeys.filter(n => n.note === "C").map(n => {
        const label = new Text({ text: `${n.note}${n.octave}`, style: { fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: muted } });
        app.stage.addChild(label); return { n, label };
      });
      const ordered = [...notes].sort((a, b) => a.start - b.start);
      const items = ordered.map(note => {
        const node = new Container(), beam = new Graphics(), ring = new Graphics(), body = new Graphics(), spark = new Graphics(), tagBackground = new Graphics();
        const label = new Text({ text: note.label ?? ["C","C♯","D","D♯","E","F","F♯","G","G♯","A","A♯","B"][note.midi % 12] + (Math.floor(note.midi / 12) - 1), style: { fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: "600", fill: background } });
        label.anchor.set(.5, 1);
        const tag = new Text({ text: note.judgment?.toUpperCase() ?? "", style: { fontFamily: "JetBrains Mono, monospace", fontSize: 11, fontWeight: "600", fill: note.judgment === "perfect" ? accent : muted } });
        tag.anchor.set(.5, 1);
        node.addChild(beam, ring, body, label, spark, tagBackground, tag); layer.addChild(node); node.visible = false;
        tagBackground.roundRect(-tag.width/2-6, -tag.height-4, tag.width+12, tag.height+8, 4).fill({ color: background, alpha: .9 }).stroke({ color: note.judgment === "perfect" ? accent : border, width: 1 });
        return { note, node, beam, ring, body, label, spark, tag, tagBackground, state: "", w: 0, h: 0, tagBeat: Number.NaN, tagged: false };
      });
      const measures = Array.from({ length: 32 }, () => {
        const label = new Text({ text: "", style: { fontFamily: "JetBrains Mono, monospace", fontSize: 10, fill: muted } });
        app.stage.addChild(label); return label;
      });
      const prefixEnd: number[] = [];
      ordered.forEach((n, i) => prefixEnd.push(Math.max(prefixEnd[i-1] ?? -Infinity, n.start + n.duration + 2)));
      let didReportReady = false;
      let dirty = true, lastBeat = NaN, lastActivity = "";
      let width = 1, height = 1, hitY = 1, previousFirst = 0, previousLast = 0, lastArmed = "\0", resetId = live.current.transport.resetId, lastAnnouncement = -Infinity;
      function resize() {
        dirty = true;
        width = Math.max(1, element.clientWidth); height = Math.max(1, element.clientHeight);
        hitY = Math.max(1, height - bottomOcclusion - HIT_LINE_INSET);
        app.renderer.resize(width, height);
        geometry = new Map(layout.notes.map(n => { const g = pianoKeyGeometry(layout, width, n); return [g.midi, g]; }));
        columns.clear();
        for (const n of [...layout.whiteKeys, ...layout.blackKeys]) {
          const g = geometry.get(pianoKeyGeometry(layout, width, n).midi)!;
          const dim = rangeLow !== undefined && rangeHigh !== undefined && (g.midi < rangeLow || g.midi > rangeHigh);
          columns.rect(g.x, 0, g.width, height).fill({ color: n.isBlack ? background : surface, alpha: (n.isBlack ? .85 : .6) * (dim ? .3 : 1) });
          if (n.note === "C") columns.moveTo(g.x, 0).lineTo(g.x, height).stroke({ color: border, width: 1 });
        }
        octaveLabels.forEach(({ n, label }) => label.position.set(pianoKeyGeometry(layout, width, n).x + 4, hitY - 24));
        mask.clear().rect(0, 0, width, height).fill(0xffffff);
        line.clear().rect(0, hitY - 2, width, 2).fill(accent);
        if (!reduced.matches) for (let i = 1; i <= 6; i++) line.rect(0, hitY - 2 - i * 2, width, 2).fill({ color: accent, alpha: .12 * (1 - i / 7) });
        // Notes dim behind this band on their last approach into the piano top bar.
        veil.clear().rect(0, hitY, width, Math.max(0, height - bottomOcclusion - hitY)).fill({ color: 0x000000, alpha: .5 });
        items.forEach(item => { item.state = ""; });
      }
      observer = new ResizeObserver(resize); observer.observe(element); resize();
      reduced.addEventListener("change", resize); motionCleanup = () => reduced.removeEventListener("change", resize);
      themeObserver = new MutationObserver(() => {
        ink = color("foreground"); background = color("background"); surface = color("card"); border = color("border"); muted = color("muted-foreground"); accent = color("primary");
        pitchColors.splice(0, 12, ...["c", "c", "d", "d", "e", "f", "f", "g", "g", "a", "a", "b"].map(n => color(`note-${n}`)));
        resize();
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "style"] });
      const draw = () => {
        const transport = live.current.transport;
        const beat = transport.getBeat();
        if (!Number.isFinite(beat)) return;
        if (resetId !== transport.resetId) { dirty = true; resetId = transport.resetId; items.forEach(item => { item.tagged = false; item.tagBeat = NaN; }); }
        const next = transport.getArmed?.() ?? new Set(nextHighwayNotes(ordered, beat, transport.getState() === "waiting").map(n => n.id));
        const armed = ordered.filter(n => next.has(n.id));
        const armedKey = armed.map(n => n.midi).join(",");
        const active = transport.getActive?.();
        const activityKey = active ? [...active].join(",") : "";
        if (!dirty && beat === lastBeat && armedKey === lastArmed && activityKey === lastActivity) return;
        dirty = false; lastBeat = beat; lastActivity = activityKey;
        if (armedKey !== lastArmed) {
          lastArmed = armedKey; live.current.onArmedChange?.(armed.map(n => n.midi));
          if (announcement.current && performance.now() - lastAnnouncement > 1000) {
            announcement.current.textContent = armed.length ? `Next: ${armed.map(n => n.label ?? items[ordered.indexOf(n)].label.text).join(", ")}` : "";
            lastAnnouncement = performance.now();
          }
        }
        const ppb = Math.min(pixelsPerBeat, hitY / 4);
        lines.clear();
        const firstBeat = Math.floor(beat);
        for (let i = 0; i < measures.length; i++) {
          const b = firstBeat + i, y = hitY - (b - beat) * ppb;
          measures[i].visible = y >= 0 && y < height && b % 4 === 0;
          if (y >= 0 && y < height) lines.moveTo(0, y).lineTo(width, y).stroke({ color: border, alpha: b % 4 === 0 ? .95 : .7, width: b % 4 === 0 ? 1.5 : .5 });
          if (measures[i].visible) { measures[i].text = String(Math.floor(b / 4) + 1); measures[i].position.set(6, y + 4); }
        }
        let lo = 0, hi = prefixEnd.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (prefixEnd[mid] < beat - bottomOcclusion / ppb) lo = mid + 1; else hi = mid; }
        const first = lo;
        let last = first;
        while (last < items.length && items[last].note.start <= beat + hitY / ppb + 1) last++;
        for (let i = previousFirst; i < previousLast; i++) if (i < first || i >= last) items[i].node.visible = false;
        previousFirst = first; previousLast = last;
        for (let i = first; i < last; i++) {
          const item = items[i], n = item.note, g = geometry.get(n.midi);
          item.node.visible = !!g;
          if (!g) continue;
          const state = highwayState(n, beat, next.has(n.id), active?.has(n.id));
          const w = Math.max(3, g.width - ([1,3,6,8,10].includes(n.midi % 12) ? 2 : 4));
          const h = Math.max(6, n.duration * ppb - 2);
          const bottom = hitY - (n.start - beat) * ppb;
          item.node.position.set(g.x + (g.width - w) / 2, bottom - h);
          if (item.state !== state || item.w !== w || item.h !== h) {
            item.state = state; item.w = w; item.h = h;
            const pitch = pitchColors[n.midi % 12];
            item.body.clear().roundRect(0, 0, w, h, Math.min(7, w / 2)).fill({ color: state === "miss" ? surface : pitch, alpha: state === "bot" || (n.who === "ai" && state === "sounding") ? .14 : 1 });
            if (state === "miss" || n.who === "ai") item.body.roundRect(0, 0, w, h, Math.min(7, w / 2)).stroke({ color: state === "miss" ? muted : pitch, width: state === "miss" ? 1 : 2 });
            item.ring.clear();
            if ((state === "next" || state === "sounding") && !reduced.matches) {
              for (let spread = 12; spread >= 4; spread -= 2) item.ring.roundRect(-spread, -spread, w+spread*2, h+spread*2, 10).fill({ color: pitch, alpha: .025 });
            }
            if (state === "next") item.ring.roundRect(-4, -4, w+8, h+8, 10).fill(ink).roundRect(-2, -2, w+4, h+4, 8).fill(background);
            item.label.visible = h >= 24 && state !== "miss";
            item.label.style.fill = n.who === "ai" ? pitch : background;
            item.label.position.set(w / 2, h - 7);
            item.spark.clear();
            if (state === "sounding" && !reduced.matches) {
              for (let r = 20; r >= 4; r -= 4) item.spark.circle(w / 2, 0, r).fill({ color: pitch, alpha: .08 });
              for (let ray = 0; ray < 8; ray++) { const a = ray * Math.PI / 4; item.spark.moveTo(w/2 + Math.cos(a)*5, Math.sin(a)*5).lineTo(w/2 + Math.cos(a)*13, Math.sin(a)*13).stroke({ color: pitch, width: 1 }); }
            }
          }
          item.label.visible = h >= 24 && state !== "miss" && hitY - item.node.y >= 18;
          item.label.position.y = Math.min(h, hitY - item.node.y) - 7;
          item.spark.position.y = hitY - item.node.y - 3;
          item.beam.clear();
          if (state === "next" && bottom < hitY) for (let step = 0; step < 8; step++) item.beam.rect(0, h + (hitY-bottom)*step/8, w, (hitY-bottom)/8).fill({ color: pitchColors[n.midi % 12], alpha: .26*(step+1)/8 });
          if (n.judgment && !item.tagged && beat >= n.start) { item.tagged = true; item.tagBeat = n.judgmentBeat ?? n.start;
            if (announcement.current && transport.getState() !== "paused" && performance.now()-lastAnnouncement > 1000) {
              announcement.current.textContent = `${item.label.text}: ${n.judgment}`; lastAnnouncement = performance.now();
            }
          }
          const age = (beat - item.tagBeat) / beatsPerSecond;
          item.tag.visible = !!n.judgment && age >= 0 && age < .75;
          item.tagBackground.visible = item.tag.visible;
          if (item.tag.visible) {
            item.tag.position.set(w/2, hitY-item.node.y-12-(reduced.matches ? 0 : age/.75*28));
            item.tag.alpha = reduced.matches ? 1 : 1-age/.75;
            item.tagBackground.position.copyFrom(item.tag.position); item.tagBackground.alpha = item.tag.alpha;
          }
        }
        app.render();
        if (!didReportReady && element.clientWidth > 1 && element.clientHeight > bottomOcclusion + 1) {
          didReportReady = true;
          // Give the first rendered frame a browser paint opportunity before declaring readiness.
          readyFrameId = requestAnimationFrame(() => { if (!disposed) { element.dataset.renderReady = "true"; live.current.onReadinessChange?.("ready"); } });
        }
      };
      const frame = () => { if (disposed) return; draw(); frameId = requestAnimationFrame(frame); };
      frame();
    }).catch(error => {
      if (!disposed) { console.error("Note Highway renderer failed", error); live.current.onReadinessChange?.("error"); if (announcement.current) announcement.current.textContent = "Note Highway could not load. The piano remains available."; }
    });
    return () => { disposed = true; cancelAnimationFrame(frameId); cancelAnimationFrame(readyFrameId); observer?.disconnect(); motionCleanup?.(); themeObserver?.disconnect(); if (app.renderer) app.destroy(true, { children: true }); };
  }, [notes, fullKeyboard, rangeLow, rangeHigh, pixelsPerBeat, beatsPerSecond, bottomOcclusion]);
  return <div ref={host} className="note-highway" role="group" aria-label="Note Highway"><span ref={announcement} className="sr-only" aria-live="polite" aria-atomic="true" /></div>;
}
