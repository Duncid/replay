import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { GraderOutput, CoachOutput } from "@/types/learningSession";
import { NoteSequence } from "@/types/noteSequence";
import { useState } from "react";

interface EvaluationDebugCardProps {
  prompt: string;
  userSequence: NoteSequence;
  evaluationType: "structured" | "free";
  onProceed: () => void;
  onCancel?: () => void;
  graderOutput?: GraderOutput | null;
  coachOutput?: CoachOutput | null;
  freePracticeEvaluation?: {
    evaluation: "correct" | "close" | "wrong";
    feedback: string;
  } | null;
  decidePrompt?: string;
}

export function EvaluationDebugCard({
  prompt,
  userSequence,
  evaluationType,
  onProceed,
  onCancel,
  graderOutput,
  coachOutput,
  freePracticeEvaluation,
  decidePrompt,
}: EvaluationDebugCardProps) {
  const [promptSheetOpen, setPromptSheetOpen] = useState(false);
  const [evalSheetOpen, setEvalSheetOpen] = useState(false);
  const [recordingSheetOpen, setRecordingSheetOpen] = useState(false);

  const hasResults = graderOutput || coachOutput || freePracticeEvaluation;

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Lesson DEBUG CARD</CardTitle>
          <CardDescription>
            Review the evaluation prompt and user recording before proceeding
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* Summary Info */}
          <div className="space-y-2">
            <div className="text-sm">
              <span className="font-semibold">Evaluation Type:</span>{" "}
              {evaluationType === "structured" ? "Structured Lesson" : "Free Practice"}
            </div>
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

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            {onCancel && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}

            <Sheet open={promptSheetOpen} onOpenChange={setPromptSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  Debug Prompt
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[600px] sm:max-w-[600px]"
              >
                <SheetHeader>
                  <SheetTitle>LLM Prompt Preview</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                  <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
                    {prompt}
                  </pre>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <Sheet open={recordingSheetOpen} onOpenChange={setRecordingSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  Debug Recording
                </Button>
              </SheetTrigger>
              <SheetContent
                side="right"
                className="w-[600px] sm:max-w-[600px]"
              >
                <SheetHeader>
                  <SheetTitle>User Recorded Sequence</SheetTitle>
                </SheetHeader>
                <ScrollArea className="h-[calc(100vh-120px)] mt-4">
                  <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
                    {JSON.stringify(userSequence, null, 2)}
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
                      {graderOutput && (
                        <div>
                          <h4 className="font-semibold mb-2">Grader Output</h4>
                          <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
                            {JSON.stringify(graderOutput, null, 2)}
                          </pre>
                        </div>
                      )}
                      {coachOutput && (
                        <div>
                          <h4 className="font-semibold mb-2">Coach Output</h4>
                          <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
                            {JSON.stringify(coachOutput, null, 2)}
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
                      {decidePrompt && (
                        <div>
                          <h4 className="font-semibold mb-2">Lesson-Decide Prompt</h4>
                          <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
                            {decidePrompt}
                          </pre>
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </SheetContent>
              </Sheet>
            )}

            <Button onClick={onProceed} size="sm" className="ml-auto">
              GO
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
