import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from "react";
import { DebugCard } from "./DebugCard";
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
    <DebugCard
      title="Lesson Selection"
      content={
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-semibold mb-2">Curriculum Stats</h4>
            <div className="text-sm text-muted-foreground">
              {debugData.curriculum.tracksCount} tracks,{" "}
              {debugData.curriculum.lessonsCount} lessons,{" "}
              {debugData.curriculum.availableLessonsCount} lessons unlocked,{" "}
              {debugData.curriculum.skillsCount} skills
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold mb-2">User Activity</h4>
            <div className="text-sm text-muted-foreground">
              {debugData.signals.timeSinceLastPracticeHours ?? "∞"} hours since
              practice, {debugData.signals.recentRunsCount} recent runs,{" "}
              {debugData.signals.unlockedSkillsCount} skills unlocked
            </div>
          </div>
        </div>
      }
      actions={
        <>
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
            <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
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
            Send
          </Button>
        </>
      }
    />
  );
}
