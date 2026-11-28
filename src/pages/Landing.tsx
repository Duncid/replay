import { useTranslation } from "react-i18next";
import { useLanguage } from "@/contexts/LanguageContext";
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { DemoSound, LivePracticeHandle } from "@/components/landing/LivePracticePreview";
import { Link, useLocation } from "react-router-dom";
import { ChevronLeft, ChevronRight, Play, Pause, KeyboardMusic, Mic, Music2 } from "lucide-react";
import { initialDemoTune } from "@/components/landing/demoScore";
import { useDemoLibrary } from "@/components/landing/useDemoLibrary";
import { useGuestEntry } from "@/components/landing/GuestEntryContext";
import NoodlynWordmark from "@/components/landing/NoodlynWordmark";
import "./Landing.css";

const LivePracticePreview = lazy(() => import("@/components/landing/LivePracticePreview"));
class PreviewBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onError(); }
  render() { return this.state.failed ? null : this.props.children; }
}

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export default function Landing() {
  const { t } = useTranslation();
  const location = useLocation();
  const entry = useGuestEntry();
  const departing = entry.phase !== "idle";
  const departingRef = useRef(departing);
  departingRef.current = departing;
  const videoMode = new URLSearchParams(location.search).get("preview") === "video";
  const tunes = useDemoLibrary();
  const { systemTitle } = useLanguage();
  const [tune, setTune] = useState(initialDemoTune);
  const [liveStarted, setLiveStarted] = useState(false);
  const changeTune = (direction: number) => {
    const index = tunes.findIndex(item => item.key === tune.key);
    const next = index < 0 ? (direction > 0 ? 0 : tunes.length - 1) : (index + direction + tunes.length) % tunes.length;
    setTune(tunes[next]);
    setLiveReady(false);
  };
  const liveRef = useRef<LivePracticeHandle>(null);
  const [livePaused, setLivePaused] = useState(false);
  const [liveReady, setLiveReady] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const [sound, setSound] = useState<DemoSound>("silent");
  const onLiveReady = useCallback(() => setLiveReady(true), []);
  const onLiveError = useCallback(() => { setLiveFailed(true); setLiveReady(false); }, []);
  const onSoundChange = useCallback((state: DemoSound) => {
    setSound(state);
    if (state === "playing") setLiveStarted(true);
    if (state === "error" || state === "blocked") setLiveStarted(false);
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeToReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches, () => true);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const motion = window.matchMedia("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)");
    let frame = 0;
    let x = 0;
    let y = 0;
    const paint = () => {
      stage.style.setProperty("--pointer-x", String(x));
      stage.style.setProperty("--pointer-y", String(y));
      frame = 0;
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const move = (event: PointerEvent) => {
      if (departingRef.current || !motion.matches || event.pointerType !== "mouse") return;
      x = (event.clientX / window.innerWidth - 0.5) * 2;
      y = (event.clientY / window.innerHeight - 0.5) * 2;
      schedule();
    };
    const reset = () => { if (!departingRef.current) { x = 0; y = 0; schedule(); } };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", reset);
    window.addEventListener("blur", reset);
    motion.addEventListener("change", reset);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      document.documentElement.removeEventListener("pointerleave", reset);
      window.removeEventListener("blur", reset);
      motion.removeEventListener("change", reset);
    };
  }, []);

  return (
    <div className="noodlyn-landing" data-preview-mode={videoMode ? "video" : "live"}
      data-preview-state={liveFailed ? "error" : liveReady ? "ready" : "loading"}>
      <a className="landing-skip" href="#discover">{t("landing.skip")}</a>
      <header className="landing-header">
        <NoodlynWordmark to={new URLSearchParams(location.search).has("home") ? "/?home" : "/"} />
        <Link className="landing-signin" to="/login">{t("auth.signIn")}</Link>
      </header>

      <main id="discover" className="landing-main">
        <div className="landing-intro">
          <h1>{t("landing.headline")}</h1>
          <p className="landing-description">{t("landing.tagline")}</p>
        </div>

        <div className="landing-product">
          <figure className="landing-preview-group">
          <div className="landing-ipad-room">
          <div className="landing-ipad-stage" ref={stageRef}>
            <div className="landing-ipad-shadow" aria-hidden="true" />
            <div className="landing-ipad" data-testid="landing-ipad">
              <div className="landing-ipad-back" aria-hidden="true" />
              <div className="landing-ipad-body">
                <span className="landing-ipad-camera" aria-hidden="true" />
                <span className="landing-ipad-power" aria-hidden="true" />
                <span className="landing-ipad-volume" aria-hidden="true" />
                <div className="landing-ipad-screen">
                  <img
                    src="/marketing/st-louis-blues-practice.png"
                    alt={t("landing.poster", { title: systemTitle("st-louis-blues", "St Louis Blues") })}
                    width="2388"
                    height="1668"
                    fetchPriority="high"
                    draggable={false}
                  />
                  {!videoMode && !reducedMotion && !liveFailed && <PreviewBoundary onError={onLiveError}>
                    <Suspense fallback={null}><LivePracticePreview ref={liveRef} tune={tune} displayTitle={systemTitle(tune.key, tune.title)} paused={livePaused} departing={departing}
                      onReady={onLiveReady} onError={onLiveError} onSoundChange={onSoundChange} /></Suspense>
                  </PreviewBoundary>}
                  {videoMode && !reducedMotion && !videoFailed && <video
                    ref={videoRef}
                    className="landing-practice-video"
                    src="/marketing/st-louis-blues-loop.mp4"
                    poster="/marketing/st-louis-blues-loop-poster.jpg"
                    aria-label={t("landing.video", { title: systemTitle("st-louis-blues", "St Louis Blues") })}
                    autoPlay loop muted playsInline preload="metadata"
                    onPlaying={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onError={() => { setVideoFailed(true); setPlaying(false); }}
                  />}
                </div>
                <div className="landing-ipad-glass" aria-hidden="true" />
              </div>
            </div>
            <Link className="landing-cta" to="/play" aria-busy={departing || undefined}
              onPointerEnter={entry.preload} onFocus={entry.preload} onPointerDown={entry.preload}
              onClick={event => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                const source = event.currentTarget.closest<HTMLElement>(".noodlyn-landing");
                if (source && entry.begin(source)) event.preventDefault();
              }}>{t("landing.start")}</Link>
          </div>
          </div>
          <figcaption>
            <span className="landing-tune-switcher">
              {!videoMode && <button type="button" className="landing-tune-chevron" aria-label={t("landing.previous")}
                disabled={tunes.length < 2 || reducedMotion || liveFailed} onClick={() => changeTune(-1)}><ChevronLeft size={16} aria-hidden="true" /></button>}
              <span className="landing-tune-title" aria-live="polite">{videoMode ? systemTitle("st-louis-blues", "St Louis Blues") : systemTitle(tune.key, tune.title)}</span>
              {!videoMode && <button type="button" className="landing-tune-chevron" aria-label={t("landing.next")}
                disabled={tunes.length < 2 || reducedMotion || liveFailed} onClick={() => changeTune(1)}><ChevronRight size={16} aria-hidden="true" /></button>}
            </span>
            {!videoMode && !reducedMotion && !liveFailed && <>
              <button className="landing-video-toggle landing-play-toggle" type="button" disabled={!liveReady}
                aria-label={liveStarted ? t("landing.pause") : t("controls.play")} aria-busy={sound === "loading"}
                onClick={() => {
                  if (liveStarted) { setLivePaused(true); setLiveStarted(false); }
                  else { liveRef.current?.play(); setLivePaused(false); setLiveStarted(true); }
                }}>
                {liveStarted ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
                {liveStarted ? t("landing.pause") : t("controls.play")}
              </button>
              {sound === "error" && <span role="status">{t("landing.samplesError")}</span>}
            </>}
            {videoMode && !reducedMotion && !videoFailed && <button className="landing-video-toggle" type="button"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) void video.play().catch(() => setPlaying(false));
                else video.pause();
              }}>{playing ? t("landing.pausePreview") : t("landing.playPreview")}</button>}
          </figcaption>
          </figure>
          <div className="landing-features">
            <div className="landing-compatibility">
              <div className="landing-input-icons" aria-hidden="true">
                <span className="landing-keyboard-icon"><KeyboardMusic /></span><span className="landing-mic-icon"><Mic /></span>
              </div>
              <p>{t("landing.input")}</p>
            </div>
            <div className="landing-compatibility">
              <div className="landing-input-icons" aria-hidden="true"><span className="landing-music-icon"><Music2 /></span></div>
              <p>{t("landing.upload")}</p>
            </div>
          </div>
        </div>
      </main>

    </div>
  );
}
