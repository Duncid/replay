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
import type { TuneEvaluationDebugData } from "@/types/tunePractice";
import { useState } from "react";

interface TuneEvaluationDebugCardProps {
  debugData: TuneEvaluationDebugData;
  onProceed: () => void;
  onCancel?: () => void;
}

export function TuneEvaluationDebugCard({
  debugData,
  onProceed,
  onCancel,
}: TuneEvaluationDebugCardProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);

  const targetNotes =
    (debugData.targetSequence as { notes?: unknown[] })?.notes || [];
  const userNotes =
    (debugData.userSequence as { notes?: unknown[] })?.notes || [];
  const promptText =
    debugData.prompt || JSON.stringify(debugData.request, null, 2);
  const promptWithFence = `\
\`\`\`
${promptText}
\`\`\`
`;

  const formatNumber = (value: unknown) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "-";
    return Number.isInteger(value) ? `${value}` : value.toFixed(3);
  };

  const renderNotesTable = (target: unknown[], user: unknown[]) => {
    const rowCount = Math.max(target.length, user.length);
    return (
      <div>
        <h4 className="text-sm font-medium mb-1">Target vs User</h4>
        <div className="border border-border rounded overflow-auto max-h-48">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground sticky top-0">
              <tr>
                <th className="text-left font-medium px-2 py-1 w-10">#</th>
                <th className="text-left font-medium px-2 py-1 text-blue-500">
                  T.Pitch
                </th>
                <th className="text-left font-medium px-2 py-1 text-accent-foreground">
                  U.Pitch
                </th>
                <th className="text-left font-medium px-2 py-1 text-blue-500">
                  T.Start
                </th>
                <th className="text-left font-medium px-2 py-1 text-accent-foreground">
                  U.Start
                </th>
                <th className="text-left font-medium px-2 py-1 text-blue-500">
                  T.End
                </th>
                <th className="text-left font-medium px-2 py-1 text-accent-foreground">
                  U.End
                </th>
                <th className="text-left font-medium px-2 py-1 text-blue-500">
                  T.Vel
                </th>
                <th className="text-left font-medium px-2 py-1 text-accent-foreground">
                  U.Vel
                </th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rowCount === 0 && (
                <tr>
                  <td className="px-2 py-2 text-muted-foreground" colSpan={9}>
                    No notes
                  </td>
                </tr>
              )}
              {Array.from({ length: rowCount }).map((_, index) => {
                const targetNote = target[index] as {
                  pitch?: number;
                  startTime?: number;
                  endTime?: number;
                  velocity?: number;
                } | undefined;
                const userNote = user[index] as {
                  pitch?: number;
                  startTime?: number;
                  endTime?: number;
                  velocity?: number;
                } | undefined;

                return (
                  <tr key={index} className="border-t border-border/50">
                    <td className="px-2 py-1">{index + 1}</td>
                    <td className="px-2 py-1">
                      {formatNumber(targetNote?.pitch)}
                    </td>
                    <td className="px-2 py-1">
                      {formatNumber(userNote?.pitch)}
                    </td>
                    <td className="px-2 py-1">
                      {formatNumber(targetNote?.startTime)}
                    </td>
                    <td className="px-2 py-1">
                      {formatNumber(userNote?.startTime)}
                    </td>
                    <td className="px-2 py-1">
                      {formatNumber(targetNote?.endTime)}
                    </td>
                    <td className="px-2 py-1">
                      {formatNumber(userNote?.endTime)}
                    </td>
                    <td className="px-2 py-1">
                      {formatNumber(targetNote?.velocity)}
                    </td>
                    <td className="px-2 py-1">
                      {formatNumber(userNote?.velocity)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const content = (
    <div className="space-y-4">
      <div>
        <p className="text-foreground mb-2">
          {debugData.tuneKey} ({debugData.nuggetId}), expected{" "}
          {targetNotes.length} notes, sending {userNotes.length}.
        </p>
      </div>

      {renderNotesTable(targetNotes, userNotes)}
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
    <DebugCard
      title="Tune Evaluation Debug"
      content={content}
      actions={actions}
    />
  );
}
