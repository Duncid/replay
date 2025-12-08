import { useState, useEffect } from "react";

interface RecordingEndingToastProps {
  show: boolean;
  progress: number;
}

export function RecordingEndingToast({ show, progress }: RecordingEndingToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  useEffect(() => {
    if (show) {
      setIsLeaving(false);
      setIsVisible(true);
    } else if (isVisible) {
      setIsLeaving(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsLeaving(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [show, isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div 
        className={`bg-primary text-primary-foreground px-4 py-2 rounded-b-lg shadow-lg min-w-[200px] transition-transform duration-200 ease-out ${
          isLeaving ? "-translate-y-full" : "translate-y-0"
        }`}
        style={{
          animation: !isLeaving ? "slide-down 0.2s ease-out" : undefined,
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