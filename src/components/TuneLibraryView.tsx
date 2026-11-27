import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { TuneCarousel, type TuneCarouselProps } from "@/components/TuneCarousel";

export interface TuneLibraryViewProps extends TuneCarouselProps {
  isLoading?: boolean;
  error?: Error | null;
  refetch: () => unknown;
}
export function TuneLibraryView({ tunes, isLoading, error, refetch, onSelectTune, onSignUp, onAddTune, builds, onRetryBuild, onDismissBuild }: TuneLibraryViewProps) {
  if (isLoading) return <LoadingSpinner message="Loading tunes…" />;
  return (
    <section className="w-full flex-1 self-stretch flex flex-col justify-center py-8">
      <h1 className="px-5 sm:px-8 mb-8 text-center font-display text-[32px] leading-[38px] sm:text-[40px] sm:leading-[44px] font-bold tracking-[-.02em]">What would you like to play?</h1>
      {error ? (
        <div role="alert" className="space-y-3 text-center">
          <p className="text-destructive">Unable to load tunes.</p>
          <Button variant="outline" onClick={() => void refetch()}>Try again</Button>
        </div>
      ) : tunes.length === 0 ? (
        <p className="text-center text-muted-foreground">No published tunes yet.</p>
      ) : (
        <TuneCarousel tunes={tunes} onSelectTune={onSelectTune} onSignUp={onSignUp} onAddTune={onAddTune} builds={builds} onRetryBuild={onRetryBuild} onDismissBuild={onDismissBuild} />
      )}
    </section>
  );
}
