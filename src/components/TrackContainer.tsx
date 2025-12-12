import { useRef, useEffect, forwardRef, useImperativeHandle, ReactNode } from "react";

interface TrackContainerProps {
  children: ReactNode;
  autoScroll?: boolean;
  scrollDependency?: unknown;
}

export interface TrackContainerHandle {
  scrollToEnd: () => void;
}

export const TrackContainer = forwardRef<TrackContainerHandle, TrackContainerProps>(
  ({ children, autoScroll = true, scrollDependency }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useImperativeHandle(ref, () => ({
      scrollToEnd: () => {
        if (containerRef.current) {
          containerRef.current.scrollLeft = containerRef.current.scrollWidth;
        }
      },
    }));

    // Auto-scroll to end when dependency changes
    useEffect(() => {
      if (autoScroll && containerRef.current) {
        containerRef.current.scrollLeft = containerRef.current.scrollWidth;
      }
    }, [autoScroll, scrollDependency]);

    return (
      <div ref={containerRef} className="w-full overflow-x-auto py-6 custom-scrollbar">
        <div className="flex gap-2 px-4 mr-6">{children}<div className="w-8 h-4 shrink-0"/></div>
      </div>
    );
  },
);

TrackContainer.displayName = "TrackContainer";
