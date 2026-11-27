import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import "@/pages/Landing.css";

const notes = ["c", "d", "e", "f", "g", "a", "b"];

export default function NoodlynWordmark({ to = "/", label = "Noodlyn home" }: { to?: string; label?: string }) {
  return <Link className="landing-wordmark" to={to} aria-label={label}>
    {Array.from("Noodlyn").map((letter, index) => <span key={index} aria-hidden="true" className="landing-wordmark-letter"
      style={{ "--letter-note": `var(--note-${notes[index]})`, "--letter-delay": `${index * 120}ms` } as CSSProperties}>{letter}</span>)}
  </Link>;
}
