import React, { useState } from "react";
import { DebugCard } from "@/components/DebugCard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { TuneDebugData } from "@/types/tunePractice";

interface TuneDebugCardProps {
  debugData: TuneDebugData;
  onProceed: () => void;
  onCancel?: () => void;
}

export function TuneDebugCard({ debugData, onProceed, onCancel }: TuneDebugCardProps) {
  const [showPrompt, setShowPrompt] = useState(false);

  const practiceStats = debugData.practiceHistory.reduce(
    (acc, h) => ({
      totalAttempts: acc.totalAttempts + h.attemptCount,
      totalPasses: acc.totalPasses + h.passCount,
      practicedNuggets: acc.practicedNuggets + (h.attemptCount > 0 ? 1 : 0),
    }),
    { totalAttempts: 0, totalPasses: 0, practicedNuggets: 0 }
  );

  const content = (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium text-foreground mb-2">Tune: {debugData.tuneTitle}</h3>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="text-muted-foreground">Tune Key:</div>
          <div className="font-mono">{debugData.tuneKey}</div>
          <div className="text-muted-foreground">Motifs:</div>
          <div>{debugData.motifsCount}</div>
          <div className="text-muted-foreground">Nuggets:</div>
          <div>{debugData.nuggetsCount}</div>
        </div>
      </div>

      <div>
        <h4 className="font-medium text-foreground mb-2">Practice History</h4>
        <div className="grid grid-cols-3 gap-2 text-sm">
          <div className="text-center p-2 bg-muted rounded">
            <div className="text-lg font-bold">{practiceStats.practicedNuggets}</div>
            <div className="text-xs text-muted-foreground">Practiced</div>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <div className="text-lg font-bold">{practiceStats.totalAttempts}</div>
            <div className="text-xs text-muted-foreground">Attempts</div>
          </div>
          <div className="text-center p-2 bg-muted rounded">
            <div className="text-lg font-bold">{practiceStats.totalPasses}</div>
            <div className="text-xs text-muted-foreground">Passes</div>
          </div>
        </div>
      </div>

      {debugData.practiceHistory.filter((h) => h.attemptCount > 0).length > 0 && (
        <div>
          <h4 className="font-medium text-foreground mb-2">Nugget States</h4>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {debugData.practiceHistory
              .filter((h) => h.attemptCount > 0)
              .map((h) => (
                <div key={h.nuggetId} className="flex items-center justify-between text-xs bg-muted/50 p-1 rounded">
                  <span className="font-mono">{h.nuggetId}</span>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-xs">{h.attemptCount} tries</Badge>
                    <Badge variant={h.currentStreak > 0 ? "default" : "secondary"} className="text-xs">🔥 {h.currentStreak}</Badge>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <Sheet open={showPrompt} onOpenChange={setShowPrompt}>
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">View Prompt</Button>
        </SheetTrigger>
        <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
          <SheetHeader>
            <SheetTitle>LLM Prompt Preview</SheetTitle>
          </SheetHeader>
          <ScrollArea className="h-[calc(100vh-100px)] mt-4">
            <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-4 rounded">
              {debugData.prompt || JSON.stringify(debugData.request, null, 2)}
            </pre>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </div>
  );

  const actions = (
    <>
      {onCancel && <Button variant="outline" size="sm" onClick={onCancel}>Cancel</Button>}
      <Button size="sm" onClick={onProceed}>Start Practice</Button>
    </>
  );

  return <DebugCard title="Tune Coach Debug" content={content} actions={actions} />;
}
