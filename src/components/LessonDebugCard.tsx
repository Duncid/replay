import { Badge } from "@/components/ui/badge";
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
import { TeacherSuggestion } from "@/types/learningSession";
import { ArrowLeft, Music } from "lucide-react";
import { useState } from "react";

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
    <div className="w-full max-w-3xl mx-auto space-y-6">
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-3">
          {suggestion.trackTitle && (
            <Badge
              variant="secondary"
              className="flex items-center gap-1 text-xs w-fit"
            >
              <Music className="h-3 w-3" />
              {suggestion.trackTitle}
            </Badge>
          )}
          <CardTitle className="text-lg">LessonStart (Debug)</CardTitle>
          <CardDescription>
            {suggestion.label}
            <br />
            {suggestion.why}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {/* Actions */}
          <div className="flex gap-2">
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

            <Button onClick={onStart} disabled={isLoading} size="sm">
              GO
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
