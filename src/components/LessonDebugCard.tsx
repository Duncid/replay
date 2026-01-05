import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TeacherSuggestion } from "@/types/learningSession";
import { ArrowLeft } from "lucide-react";
import { useState } from "react";
import { DebugCard } from "./DebugCard";

interface LessonDebugCardProps {
  suggestion: TeacherSuggestion;
  prompt: string;
  isLoading: boolean;
  onStart: () => void;
  onCancel: () => void;
}

export function LessonDebugCard({
  suggestion,
  prompt,
  isLoading,
  onStart,
  onCancel,
}: LessonDebugCardProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <DebugCard
      title="Lesson Start"
      content={
        <>
          {suggestion.trackTitle && (
            <Badge className="flex items-center gap-1 text-xs w-fit mb-2">
              {suggestion.trackTitle}
            </Badge>
          )}
          <div className="text-sm text-muted-foreground">
            {suggestion.label}
            <br />
            {suggestion.why}
          </div>
        </>
      }
      actions={
        <>
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                Debug
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-[600px] sm:max-w-[600px]">
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
          <div className="flex-1" />
          <Button onClick={onStart} disabled={isLoading} size="sm">
            Send
          </Button>
        </>
      }
    />
  );
}
