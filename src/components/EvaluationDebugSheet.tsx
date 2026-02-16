import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { DebugLLMCall } from "@/hooks/useLessonEngine";
import type { EvaluationOutput } from "@/types/learningSession";
import type { SkillToUnlock } from "@/components/LessonCard";
import { Copy } from "lucide-react";

interface EvaluationDebugSheetProps {
  title: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  debugCall?: DebugLLMCall;
  evaluationOutput?: EvaluationOutput | null;
  awardedSkills?: SkillToUnlock[];
}

export function EvaluationDebugSheet({
  title,
  open,
  onOpenChange,
  debugCall,
  evaluationOutput,
  awardedSkills,
}: EvaluationDebugSheetProps) {
  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      console.error("Failed to copy", e);
    }
  };

  const skillAwarded = awardedSkills && awardedSkills.length > 0;
  const lessonAcquired = evaluationOutput?.markLessonAcquired ?? false;
  const diagnosis = evaluationOutput?.diagnosis ?? [];
  const evaluationExplanation = evaluationOutput?.feedbackText ?? "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-80px)] mt-4">
          {/* Debug Information - at top */}
          {(evaluationOutput || skillAwarded) && (
            <div className="mb-6">
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 space-y-3">
                <div className="font-medium text-sm text-amber-600 dark:text-amber-400 mb-2">
                  Debug Information
                </div>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-semibold">Skill Awarded:</span>{" "}
                    <span
                      className={
                        skillAwarded
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-600 dark:text-gray-400"
                      }
                    >
                      {skillAwarded ? "Yes" : "No"}
                    </span>
                    {skillAwarded && awardedSkills && (
                      <span className="ml-2 text-muted-foreground">
                        ({awardedSkills.map((s) => s.title).join(", ")})
                      </span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold">Lesson Acquired:</span>{" "}
                    <span
                      className={
                        lessonAcquired
                          ? "text-green-600 dark:text-green-400"
                          : "text-gray-600 dark:text-gray-400"
                      }
                    >
                      {lessonAcquired ? "Yes" : "No"}
                    </span>
                  </div>
                  {evaluationOutput && (
                    <>
                      <div>
                        <span className="font-semibold">Evaluation:</span>{" "}
                        <span className="capitalize">
                          {evaluationOutput.evaluation}
                        </span>
                      </div>
                      {diagnosis.length > 0 && (
                        <div>
                          <span className="font-semibold">Diagnosis:</span>{" "}
                          <span className="text-muted-foreground">
                            {diagnosis.join(", ")}
                          </span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-amber-500/20">
                        <div className="font-semibold mb-1">
                          Coach Evaluation:
                        </div>
                        <div className="text-muted-foreground italic">
                          {evaluationExplanation}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Request Section */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Request</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(debugCall?.request || "")
                }
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
              {debugCall?.request || "Not captured yet."}
            </pre>
          </div>
          {/* Response Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold">Response</h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  copyToClipboard(debugCall?.response || "")
                }
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
            <pre className="text-xs font-mono whitespace-pre-wrap bg-muted p-4 rounded-md">
              {debugCall?.response || "Not captured yet."}
            </pre>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
