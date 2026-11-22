import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { TuneCard } from "@/components/TuneCard";

export interface TuneLibraryViewProps {
  tunes: { tune_key: string; unlocked: boolean; prerequisites: string[] }[];
  isLoading?: boolean;
  error?: Error | null;
  refetch: () => unknown;
  onSelectTune: (key: string) => void;
}
export function TuneLibraryView({ tunes, isLoading, error, refetch, onSelectTune }: TuneLibraryViewProps) {
  if (isLoading) return <LoadingSpinner message="Loading tunes…" />;
  return (
    <section className="w-full max-w-4xl mx-auto self-start px-5 py-8 sm:px-8">
      <header className="flex items-baseline justify-between gap-4 mb-6">
        <h1 className="font-display text-[40px] leading-[44px] font-bold tracking-[-.02em]">Tunes</h1>
        {!error && <span className="font-mono text-[11px] font-semibold uppercase tracking-[.12em] text-muted-foreground"><span className="text-primary">{tunes.filter(tune => tune.unlocked).length}</span> / {tunes.length} unlocked</span>}
      </header>
      {error ? (
        <div role="alert" className="space-y-3">
          <p className="text-destructive">Unable to load tunes.</p>
          <Button variant="outline" onClick={() => void refetch()}>Try again</Button>
        </div>
      ) : tunes.length === 0 ? (
        <p className="text-muted-foreground">No published tunes yet.</p>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {tunes.map(tune => (
            <li key={tune.tune_key}>
              <TuneCard title={tune.tune_key} unlocked={tune.unlocked} prerequisites={tune.prerequisites}
                onSelect={() => onSelectTune(tune.tune_key)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}