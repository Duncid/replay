import { useEffect, useState } from "react";

interface RecordingEndingToastProps {
  show: boolean;
  progress: number;
}

export function RecordingEndingToast({ show, progress }: RecordingEndingToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  useEffect(() => {
    if (show) {
      setIsAnimatingOut(false);
      setIsVisible(true);
    } else if (isVisible) {
      // Start exit animation
      setIsAnimatingOut(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsAnimatingOut(false);
      }, 200); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [show, isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div
        className={`bg-primary text-primary-foreground px-4 py-2 rounded-b-lg shadow-lg min-w-[200px] transition-transform duration-200 ease-out ${
          isAnimatingOut ? "-translate-y-full opacity-0" : "translate-y-0 opacity-100"
        }`}
        style={{
          animation: !isAnimatingOut ? "slide-in-from-top 0.2s ease-out" : undefined,
        }}
      >
        <div className="text-sm font-medium text-center mb-2">Recording...</div>
        <div className="h-1.5 bg-primary-foreground/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-foreground transition-all duration-[16ms] ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
