interface RecordingEndingToastProps {
  show: boolean;
  progress: number;
}

export function RecordingEndingToast({ show, progress }: RecordingEndingToastProps) {
  if (!show) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 flex justify-center pointer-events-none">
      <div className="bg-primary text-primary-foreground px-4 py-2 rounded-b-lg shadow-lg min-w-[200px]">
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