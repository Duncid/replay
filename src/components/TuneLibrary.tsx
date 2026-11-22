import { useTuneLibrary } from "@/hooks/useTuneLibrary";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { ArrowRight, LockKeyhole, Music2 } from "lucide-react";

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
            <li key={tune.tune_key} className="min-w-0 border border-border rounded-lg bg-card text-card-foreground">
              <Button
                variant="ghost"
                className="h-auto min-h-32 w-full rounded-lg p-5 flex items-center justify-between gap-4 whitespace-normal text-left"
                disabled={!tune.unlocked}
                onClick={() => { if (tune.unlocked) onSelectTune(tune.tune_key); }}
                aria-label={`${tune.unlocked ? "Practice" : "Locked"}: ${tune.tune_key}`}
              >
                <span className="flex min-w-0 items-center gap-4">
                  {tune.unlocked ? <Music2 className="size-6 shrink-0 text-primary" /> : <LockKeyhole className="size-6 shrink-0 text-muted-foreground" />}
                  <span className="min-w-0 space-y-2">
                    <span className="block text-lg font-semibold break-words">{tune.tune_key}</span>
                    <span className="block text-sm font-normal text-muted-foreground break-words">
                      {tune.unlocked ? "Unlocked" : `Locked · Complete ${tune.prerequisites.join(", ")}`}
                    </span>
                  </span>
                </span>
                {tune.unlocked && <ArrowRight className="size-5 shrink-0 text-muted-foreground" />}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}