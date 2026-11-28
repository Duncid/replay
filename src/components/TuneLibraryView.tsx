import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { TuneCarousel, type TuneCarouselProps } from "@/components/TuneCarousel";

export interface TuneLibraryViewProps extends TuneCarouselProps {
  isLoading?: boolean;
  error?: Error | null;
  refetch: () => unknown;
}
export function TuneLibraryView({ tunes, isLoading, error, refetch, onSelectTune, onSignUp, previewPaused, onAddTune, builds, onRetryBuild, onDismissBuild, onRemoveTune }: TuneLibraryViewProps) {
  const { t } = useTranslation();
  if (isLoading) return <LoadingSpinner message={t("library.loading")} />;
  return (
    <section className="w-full flex-1 self-stretch flex flex-col justify-center py-8">
      <h1 className="px-5 sm:px-8 mb-8 text-center font-display text-[32px] leading-[38px] sm:text-[40px] sm:leading-[44px] font-bold tracking-[-.02em]">{t("tune.libraryHeading")}</h1>
      {error ? (
        <div role="alert" className="space-y-3 text-center">
          <p className="text-destructive">{t("library.loadFailed")}</p>
          <Button variant="outline" onClick={() => void refetch()}>{t("library.retry")}</Button>
        </div>
      ) : tunes.length === 0 && !onAddTune && !builds?.length ? (
        <p className="text-center text-muted-foreground">{t("library.empty")}</p>
      ) : (
        <TuneCarousel tunes={tunes} onSelectTune={onSelectTune} onSignUp={onSignUp} previewPaused={previewPaused} onAddTune={onAddTune} builds={builds} onRetryBuild={onRetryBuild} onDismissBuild={onDismissBuild} onRemoveTune={onRemoveTune} />
      )}
    </section>
  );
}
