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
import { useState } from "react";
import { TeacherDebugData } from "./TeacherWelcome";

interface PracticePlanDebugCardProps {
  debugData: TeacherDebugData;
  onProceed: () => void;
  onCancel?: () => void;
}

export function PracticePlanDebugCard({
  debugData,
  onProceed,
  onCancel,
}: PracticePlanDebugCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Practice Plan DEBUG CARD</CardTitle>
          <CardDescription>
            Review the LLM prompt and activity data before proceeding
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* Activity Data Summary */}
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold mb-2">Curriculum Stats</h4>
              <div className="text-sm text-muted-foreground">
                {debugData.curriculum.tracksCount} tracks,{" "}
                {debugData.curriculum.lessonsCount} lessons,{" "}
                {debugData.curriculum.skillsCount} skills,{" "}
                {debugData.curriculum.edgesCount} edges
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Signals</h4>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md p-2 text-center bg-muted/50">
                  <div className="text-lg font-semibold">
                    {debugData.signals.timeSinceLastPracticeHours ?? "∞"}
                  </div>
                  <div className="text-xs">Hours since practice</div>
                </div>
                <div className="rounded-md p-2 text-center bg-muted/50">
                  <div className="text-lg font-semibold">
                    {debugData.signals.recentRunsCount}
                  </div>
                  <div className="text-xs">Recent runs</div>
                </div>
                <div className="rounded-md p-2 text-center bg-muted/50">
                  <div className="text-lg font-semibold">
                    {debugData.signals.unlockedSkillsCount}
                  </div>
                  <div className="text-xs">Skills unlocked</div>
                </div>
              </div>
            </div>

            <div>
              <h4 className="text-sm font-semibold mb-2">Candidates</h4>
              <div className="text-sm text-muted-foreground">
                {debugData.candidates.length} lesson candidates available
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            {onCancel && (
              <Button variant="outline" size="sm" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="sm">
                  Debug
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
                    {debugData.prompt}
                  </pre>
                </ScrollArea>
              </SheetContent>
            </Sheet>

            <Button onClick={onProceed} size="sm" className="ml-auto">
              GO
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
