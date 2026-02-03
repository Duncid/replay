import { DebugCard } from "@/components/DebugCard";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { TuneEvaluationDebugData, TuneEvaluationResponse } from "@/types/tunePractice";
import { TuneEvaluationNotesTable } from "@/components/TuneEvaluationNotesTable";
import { useState } from "react";

interface TuneEvaluationDebugCardProps {
  debugData: TuneEvaluationDebugData;
  evaluationResult?: TuneEvaluationResponse | null;
  onProceed: () => void;
  onCancel?: () => void;
}

export function TuneEvaluationDebugCard({
  debugData,
  evaluationResult,
  onProceed,
  onCancel,
}: TuneEvaluationDebugCardProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const promptText =
    debugData.prompt || JSON.stringify(debugData.request, null, 2);
  const promptWithFence = `\
\`\`\`
${promptText}
\`\`\`
`;

  const content = (
    <div className="space-y-4">
      <div>
        <p className="text-foreground mb-2">
          {debugData.tuneKey} ({debugData.nuggetId}), expected{" "}
          {(debugData.targetSequence as { notes?: unknown[] })?.notes?.length ??
            0}{" "}
          notes, sending{" "}
          {(debugData.userSequence as { notes?: unknown[] })?.notes?.length ?? 0}
          .
        </p>
      </div>

      <TuneEvaluationNotesTable debugData={debugData} />

      {evaluationResult?.reasoning && (
        <div className="mt-3 pt-3 border-t">
          <h4 className="text-sm font-medium mb-2 text-muted-foreground">LLM Reasoning</h4>
          <pre className="text-xs bg-muted p-3 rounded whitespace-pre-wrap font-mono">
            {evaluationResult.reasoning}
          </pre>
        </div>
      )}
    </div>
  );

  const actions = (
    <Sheet open={showPrompt} onOpenChange={setShowPrompt}>
      <div className="flex w-full items-center justify-between gap-3">
        <SheetTrigger asChild>
          <Button variant="outline" size="sm">
            View Prompt
          </Button>
        </SheetTrigger>
        <div className="flex items-center gap-2">
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
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>Evaluation Prompt</SheetTitle>
        </SheetHeader>
        <div className="flex justify-end mt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(promptWithFence);
                setPromptCopied(true);
                window.setTimeout(() => setPromptCopied(false), 2000);
              } catch (error) {
                console.error("Failed to copy prompt", error);
              }
            }}
          >
            {promptCopied ? "Copied" : "Copy"}
          </Button>
        </div>
        <ScrollArea className="h-[calc(100vh-100px)] mt-4">
          <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-4 rounded">
            {promptWithFence}
          </pre>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );

  return (
    <DebugCard title="Tune Evaluation" content={content} actions={actions} />
  );
}
