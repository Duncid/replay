interface RecordingProgressProps {
  show: boolean;
  progress: number;
}

export function RecordingProgress({ show, progress }: RecordingProgressProps) {
  if (!show) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
      <div className="bg-card border border-border shadow-lg rounded-lg p-4 min-w-[300px]">
        <div className="text-sm font-medium text-center text-foreground mb-3">AI preparing response...</div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-key-active-user to-accent transition-all duration-[16ms] ease-linear"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}
