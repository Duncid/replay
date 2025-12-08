import { useEffect, useState, ReactNode } from "react";

interface TopToastProps {
  show: boolean;
  children: ReactNode;
}

export function TopToast({ show, children }: TopToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [animationState, setAnimationState] = useState<"entering" | "visible" | "exiting">("visible");

  useEffect(() => {
    if (show && !isVisible) {
      setIsVisible(true);
      setAnimationState("entering");
      const timer = setTimeout(() => setAnimationState("visible"), 120);
      return () => clearTimeout(timer);
    } else if (!show && isVisible) {
      setAnimationState("exiting");
      const timer = setTimeout(() => {
        setIsVisible(false);
        setAnimationState("visible");
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [show, isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div
        className={`bg-primary text-primary-foreground px-4 py-2 rounded-b-lg shadow-lg min-w-[140px] transition-all duration-[120ms] ease-out ${
          animationState === "entering"
            ? "-translate-y-full opacity-0"
            : animationState === "exiting"
            ? "-translate-y-full opacity-0"
            : "translate-y-0 opacity-100"
        }`}
        style={{
          transform: animationState === "entering" ? "translateY(-100%)" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}

interface TopToastProgressProps {
  show: boolean;
  progress: number;
  label?: string;
}

export function TopToastProgress({ show, progress, label = "Recording..." }: TopToastProgressProps) {
  return (
    <TopToast show={show}>
      <div className="text-sm font-medium text-center mb-2">{label}</div>
      <div className="h-1.5 bg-primary-foreground/20 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary-foreground transition-all duration-[16ms] ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
    </TopToast>
  );
}

interface TopToastLabelProps {
  show: boolean;
  icon?: ReactNode;
  label: string;
  pulse?: boolean;
}

export function TopToastLabel({ show, icon, label, pulse = false }: TopToastLabelProps) {
  return (
    <TopToast show={show}>
      <div className={`flex items-center justify-center gap-2 ${pulse ? "animate-pulse" : ""}`}>
        {icon}
        <span className="font-medium">{label}</span>
      </div>
    </TopToast>
  );
}
