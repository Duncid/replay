import { useTuneLibrary } from "@/hooks/useTuneLibrary";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { TuneCard } from "@/components/TuneCard";

interface TuneLibraryProps {
  localUserId?: string | null;
  onSelectTune: (tuneKey: string) => void;
}

export function TuneLibrary({ localUserId, onSelectTune }: TuneLibraryProps) {
  const { tunes, isLoading, error, refetch } = useTuneLibrary(localUserId);
  if (isLoading) return <LoadingSpinner message="Loading tunes…" />;
  return (
    <section className="w-full max-w-4xl mx-auto self-start px-5 py-8 sm:px-8">
      <header className="flex items-baseline justify-between gap-4 mb-6">
        <h1 className="text-3xl font-semibold">Tunes</h1>
        {!error && <span className="text-sm text-muted-foreground">{tunes.filter(tune => tune.unlocked).length} / {tunes.length} unlocked</span>}
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