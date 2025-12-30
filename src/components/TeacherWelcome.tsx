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
import { supabase } from "@/integrations/supabase/client";
import {
  TeacherGreetingResponse,
  TeacherSuggestion,
} from "@/types/learningSession";
import { Loader2, Music } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

export interface TeacherDebugData {
  debug: true;
  curriculum: {
    tracksCount: number;
    lessonsCount: number;
    skillsCount: number;
    edgesCount: number;
    tracks: Array<{ key: string; title: string; startLesson?: string }>;
    lessons: Array<{ key: string; title: string; goal: string }>;
    skills: Array<{ key: string; title: string; unlocked: boolean }>;
  };
  candidates: Array<{
    lessonKey: string;
    title: string;
    goal: string;
    category: string;
    trackKey?: string;
    lastPracticed?: string | null;
    lastEvaluations?: string[];
    lastDifficulty?: number;
    attemptsLast7Days?: number;
  }>;
  signals: {
    timeSinceLastPracticeHours: number | null;
    recentRunsCount: number;
    unlockedSkillsCount: number;
  };
  prompt: string;
}

interface TeacherWelcomeProps {
  greeting: TeacherGreetingResponse | null;
  isLoading: boolean;
  onSelectActivity: (suggestion: TeacherSuggestion) => void;
  onStart: () => void;
  language?: string;
  localUserId?: string | null;
}

export function TeacherWelcome({
  greeting,
  isLoading,
  onSelectActivity,
  onStart,
  language = "en",
  localUserId,
}: TeacherWelcomeProps) {
  const { t } = useTranslation();
  const [debugData, setDebugData] = useState<TeacherDebugData | null>(null);
  const [isLoadingDebug, setIsLoadingDebug] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchDebugData = useCallback(async () => {
    setIsLoadingDebug(true);
    setDebugError(null);
    try {
      const { data, error } = await supabase.functions.invoke("teacher-greet", {
        body: { language, debug: true, localUserId },
      });

      if (error) {
        throw new Error(error.message);
      }

      if (data?.debug) {
        setDebugData(data as TeacherDebugData);
      } else {
        setDebugError("Debug mode not returning expected data");
      }
    } catch (err) {
      console.error("Failed to fetch debug data:", err);
      setDebugError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setIsLoadingDebug(false);
    }
  }, [language, localUserId]);

  // Fetch debug data on mount
  useEffect(() => {
    fetchDebugData();
  }, [fetchDebugData]);

  // If greeting is available, show the suggestions UI
  if (greeting) {
    return (
      <div className="w-full max-w-3xl mx-auto space-y-6">
        {/* Greeting */}
        <div className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-xl font-semibold">{greeting.greeting}</h2>
          </div>
          {greeting.notes && (
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              {greeting.notes}
            </p>
          )}
        </div>

        {/* Activity Suggestions */}
        <div className="grid gap-4 md:grid-cols-2">
          {greeting.suggestions.map((suggestion) => (
            <Card
              key={suggestion.lessonKey}
              className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
              onClick={() => onSelectActivity(suggestion)}
            >
              <CardHeader className="pb-2">
                {suggestion.trackTitle && (
                  <Badge
                    variant="secondary"
                    className="flex items-center gap-1 text-xs w-fit"
                  >
                    <Music className="h-3 w-3" />
                    {suggestion.trackTitle}
                  </Badge>
                )}
                <CardTitle className="text-base leading-tight mt-2">
                  {suggestion.label}
                </CardTitle>
                <CardDescription className="text-sm">
                  {suggestion.why}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <Button className="w-full" size="sm">
                  {t("learnMode.startLesson", "Start Lesson")}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // Loading state for initial greeting fetch (after Start is clicked)
  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">
          {t("learnMode.loadingTeacher", "Preparing your lesson...")}
        </p>
      </div>
    );
  }

  // Debug Card - shown by default before Start is clicked
  return (
    <div className="w-full max-w-3xl h-full flex flex-col justify-center items-center mx-auto space-y-6">
      {/* Debug Card */}
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">Teacher Context</CardTitle>
          </div>
          <CardDescription>
            {isLoadingDebug
              ? "Loading curriculum and activity data..."
              : debugError
              ? `Error: ${debugError}`
              : debugData
              ? `${debugData.curriculum.tracksCount} tracks, ${debugData.curriculum.lessonsCount} lessons, ${debugData.curriculum.edgesCount} edges, ${debugData.candidates.length} candidates`
              : "No data"}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {isLoadingDebug && (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm text-muted-foreground">
                Fetching debug data...
              </span>
            </div>
          )}

          {debugData && (
            <div className="space-y-4">
              {/* Signals Summary */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-md p-2 text-center">
                  <div className="text-lg font-semibold">
                    {debugData.signals.timeSinceLastPracticeHours ?? "∞"}
                  </div>
                  <div className="text-xs">Hours since practice</div>
                </div>
                <div className="rounded-md p-2 text-center">
                  <div className="text-lg font-semibold">
                    {debugData.signals.recentRunsCount}
                  </div>
                  <div className="text-xs">Recent runs</div>
                </div>
                <div className="rounded-md p-2 text-center">
                  <div className="text-lg font-semibold">
                    {debugData.signals.unlockedSkillsCount}
                  </div>
                  <div className="text-xs">Skills unlocked</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline">Debug</Button>
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

                <Button onClick={onStart}>Start</Button>
              </div>
            </div>
          )}

          {debugError && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={fetchDebugData}>
                Retry
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
