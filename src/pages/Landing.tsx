import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import "./Landing.css";

const reducedMotionQuery = "(prefers-reduced-motion: reduce)";
function subscribeToReducedMotion(onChange: () => void) {
  const query = window.matchMedia(reducedMotionQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export default function Landing() {
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
      if (!motion.matches || event.pointerType !== "mouse") return;
      x = (event.clientX / window.innerWidth - 0.5) * 2;
      y = (event.clientY / window.innerHeight - 0.5) * 2;
      schedule();
    };
    const reset = () => { x = 0; y = 0; schedule(); };
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
    <div className="noodlyn-landing">
      <a className="landing-skip" href="#discover">Skip to content</a>
      <header className="landing-header">
        <Link className="landing-wordmark" to="/" aria-label="Noodlyn home">Noodlyn<span aria-hidden="true">.</span></Link>
        <Link className="landing-signin" to="/login">Sign in</Link>
      </header>

      <main id="discover" className="landing-main">
        <div className="landing-intro">
          <p className="landing-eyebrow">A little practice. A little progress.</p>
          <h1>Find your rhythm.</h1>
          <p className="landing-description">The music you love. One note at a time.</p>
          <Link className="landing-cta" to="/login">Start playing</Link>
        </div>

        <figure className="landing-product">
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
                    alt="St Louis Blues player practice on Noodlyn, with colorful falling notes and highlighted piano keys."
                    width="2388"
                    height="1668"
                    fetchPriority="high"
                    draggable={false}
                  />
                  {!reducedMotion && !videoFailed && <video
                    ref={videoRef}
                    className="landing-practice-video"
                    src="/marketing/st-louis-blues-loop.mp4"
                    poster="/marketing/st-louis-blues-loop-poster.jpg"
                    aria-label="St Louis Blues, a 24-second loop of player practice"
                    autoPlay loop muted playsInline preload="metadata"
                    onPlaying={() => setPlaying(true)}
                    onPause={() => setPlaying(false)}
                    onError={() => { setVideoFailed(true); setPlaying(false); }}
                  />}
                </div>
                <div className="landing-ipad-glass" aria-hidden="true" />
              </div>
            </div>
          </div>
          <figcaption>
            <span>St Louis Blues</span><span className="landing-caption-divider" aria-hidden="true">/</span>12-bar practice loop
            {!reducedMotion && !videoFailed && <button className="landing-video-toggle" type="button"
              onClick={() => {
                const video = videoRef.current;
                if (!video) return;
                if (video.paused) void video.play().catch(() => setPlaying(false));
                else video.pause();
              }}>{playing ? "Pause preview" : "Play preview"}</button>}
          </figcaption>
        </figure>
      </main>

      <footer className="landing-footer"><span>Less overthinking. More playing.</span><span>Made for your musical moments.</span></footer>
    </div>
  );
}
