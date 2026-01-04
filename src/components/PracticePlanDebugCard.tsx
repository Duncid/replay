import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
          <CardTitle className="text-lg">LessonSelection (Debug)</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* Activity Data Summary */}
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
                {debugData.signals.timeSinceLastPracticeHours ?? "∞"} hours
                since practice, {debugData.signals.recentRunsCount} recent runs,{" "}
                {debugData.signals.unlockedSkillsCount} skills unlocked
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
