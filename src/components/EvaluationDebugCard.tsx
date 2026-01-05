import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { EvaluationOutput } from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";
import { useState } from "react";
import { DebugCard } from "./DebugCard";

interface EvaluationDebugCardProps {
  prompt: string;
  userSequence: NoteSequence;
  evaluationType: "structured" | "free";
  onProceed: () => void;
  onCancel?: () => void;
  evaluationOutput?: EvaluationOutput | null;
  freePracticeEvaluation?: {
    evaluation: "correct" | "close" | "wrong";
    feedback: string;
  } | null;
}

export function EvaluationDebugCard({
  prompt,
  userSequence,
  evaluationType,
  onProceed,
  onCancel,
  evaluationOutput,
  freePracticeEvaluation,
}: EvaluationDebugCardProps) {
  const [requestSheetOpen, setRequestSheetOpen] = useState(false);
  const [evalSheetOpen, setEvalSheetOpen] = useState(false);

  const hasResults = evaluationOutput || freePracticeEvaluation;

  return (
    <DebugCard
      title="Evaluation DEBUG"
      content={
        <>
          <div className="text-sm text-muted-foreground mb-2">
            Review the evaluation prompt and user recording before proceeding
          </div>
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-semibold">User Recording:</span>{" "}
              {userSequence.notes.length} notes
            </div>
            {hasResults && (
              <div className="text-sm">
                <span className="font-semibold">Status:</span>{" "}
                <span className="text-green-600">Evaluation Complete</span>
              </div>
            )}
          </div>
        </>
      }
      actions={
        <>
          <Sheet open={requestSheetOpen} onOpenChange={setRequestSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm">
                Debug
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
              <SheetHeader>
                <SheetTitle>LLM Evaluation Request</SheetTitle>
              </SheetHeader>
              <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
                  {prompt}
                </pre>
              </ScrollArea>
            </SheetContent>
          </Sheet>

          {hasResults && (
            <Sheet open={evalSheetOpen} onOpenChange={setEvalSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  Debug Eval
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[600px] sm:max-w-[600px]"
              >
                <SheetHeader>
                  <SheetTitle>Evaluation Results</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                  <div className="space-y-4">
                    {evaluationOutput && (
                      <div>
                        <h4 className="font-semibold mb-2">
                          Evaluation Output
                        </h4>
                        <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
                          {JSON.stringify(evaluationOutput, null, 2)}
                        </pre>
                      </div>
                    )}
                    {freePracticeEvaluation && (
                      <div>
                        <h4 className="font-semibold mb-2">Evaluation</h4>
                        <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
                          {JSON.stringify(freePracticeEvaluation, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </SheetContent>
            </Sheet>
          )}

          <Button onClick={onProceed} size="sm" className="ml-auto">
            Send
          </Button>
        </>
      }
    />
  );
}
