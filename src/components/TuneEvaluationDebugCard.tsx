import React, { useState } from "react";
import { DebugCard } from "@/components/DebugCard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { TuneEvaluationDebugData } from "@/types/tunePractice";

interface TuneEvaluationDebugCardProps {
  debugData: TuneEvaluationDebugData;
  onProceed: () => void;
  onCancel?: () => void;
}

export function TuneEvaluationDebugCard({ debugData, onProceed, onCancel }: TuneEvaluationDebugCardProps) {
  const [showPrompt, setShowPrompt] = useState(false);

  const targetNotes = (debugData.targetSequence as { notes?: unknown[] })?.notes || [];
  const userNotes = (debugData.userSequence as { notes?: unknown[] })?.notes || [];

  return (
    <DebugCard title="Tune Evaluation Debug">
      <div className="space-y-4">
        <div>
          <h3 className="font-medium text-foreground mb-2">Evaluating: {debugData.nuggetId}</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-muted-foreground">Tune:</div>
            <div className="font-mono">{debugData.tuneKey}</div>
            <div className="text-muted-foreground">Target Notes:</div>
            <div>{targetNotes.length}</div>
            <div className="text-muted-foreground">User Notes:</div>
            <div>{userNotes.length}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-medium mb-1">Target Sequence</h4>
            <pre className="text-xs bg-muted p-2 rounded max-h-24 overflow-auto">
              {JSON.stringify(targetNotes.slice(0, 5), null, 1)}
              {targetNotes.length > 5 && `\n... +${targetNotes.length - 5} more`}
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-medium mb-1">User Recording</h4>
            <pre className="text-xs bg-muted p-2 rounded max-h-24 overflow-auto">
              {JSON.stringify(userNotes.slice(0, 5), null, 1)}
              {userNotes.length > 5 && `\n... +${userNotes.length - 5} more`}
            </pre>
          </div>
        </div>

        <div className="flex gap-2">
          <Sheet open={showPrompt} onOpenChange={setShowPrompt}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                View Prompt
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
              <SheetHeader>
                <SheetTitle>Evaluation Prompt Preview</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-100px)] mt-4">
                <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-4 rounded">
                  {debugData.prompt || JSON.stringify(debugData.request, null, 2)}
                </pre>
              </ScrollArea>
            </SheetContent>
          </Sheet>

          {onCancel && (
            <Button variant="outline" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button size="sm" onClick={onProceed}>
            Send Evaluation
          </Button>
        </div>
      </div>
    </DebugCard>
  );
}
