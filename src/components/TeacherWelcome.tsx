import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { TeacherGreetingResponse, TeacherSuggestion } from "@/types/learningSession";
import { Clock, Play, Sparkles, TrendingUp, RotateCcw, Loader2, Bug, Eye, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface TeacherDebugData {
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
  onFreePractice: () => void;
  language?: string;
}

function getDifficultyIcon(mode: string) {
  switch (mode) {
    case "easier":
      return <RotateCcw className="h-3 w-3" />;
    case "harder":
      return <TrendingUp className="h-3 w-3" />;
    default:
      return null;
  }
}

function getDifficultyLabel(mode: string) {
  switch (mode) {
    case "easier":
      return "Easier";
    case "harder":
      return "Harder";
    case "same":
      return "Same level";
    case "set":
      return "Custom";
    default:
      return "";
  }
}

export function TeacherWelcome({
  greeting,
  isLoading,
  onSelectActivity,
  onFreePractice,
  language = "en",
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
        body: { language, debug: true },
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
  }, [language]);

  // Fetch debug data on mount
  useEffect(() => {
    fetchDebugData();
  }, [fetchDebugData]);

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <Card className="border-primary/20">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">{t("learnMode.loadingTeacher", "Preparing your lesson...")}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Debug Card - shown when greeting is loading or not available
  if (!greeting) {
    return (
      <div className="w-full max-w-3xl mx-auto space-y-6">
        {/* Debug Card */}
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bug className="h-5 w-5 text-amber-500" />
              <CardTitle className="text-lg">Debug: Teacher Context</CardTitle>
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
                <span className="text-sm text-muted-foreground">Fetching debug data...</span>
              </div>
            )}

            {debugData && (
              <div className="space-y-4">
                {/* Signals Summary */}
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-md bg-muted p-2 text-center">
                    <div className="text-lg font-semibold">
                      {debugData.signals.timeSinceLastPracticeHours ?? "∞"}
                    </div>
                    <div className="text-xs text-muted-foreground">Hours since practice</div>
                  </div>
                  <div className="rounded-md bg-muted p-2 text-center">
                    <div className="text-lg font-semibold">{debugData.signals.recentRunsCount}</div>
                    <div className="text-xs text-muted-foreground">Recent runs</div>
                  </div>
                  <div className="rounded-md bg-muted p-2 text-center">
                    <div className="text-lg font-semibold">{debugData.signals.unlockedSkillsCount}</div>
                    <div className="text-xs text-muted-foreground">Skills unlocked</div>
                  </div>
                </div>

                {/* Candidates Preview */}
                {debugData.candidates.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Candidate Activities:</div>
                    <div className="space-y-1">
                      {debugData.candidates.slice(0, 3).map((c) => (
                        <div
                          key={c.lessonKey}
                          className="flex items-center gap-2 text-sm bg-muted/50 rounded px-2 py-1"
                        >
                          <Badge variant="outline" className="text-xs">
                            {c.category}
                          </Badge>
                          <span className="font-medium">{c.title}</span>
                          <span className="text-muted-foreground truncate">{c.goal}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Eye className="h-4 w-4" />
                        View Full Prompt
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

                  <Button
                    onClick={onFreePractice}
                    className="gap-2 flex-1"
                  >
                    <ChevronRight className="h-4 w-4" />
                    Start (Use Fallback)
                  </Button>
                </div>
              </div>
            )}

            {debugError && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={fetchDebugData}>
                  Retry
                </Button>
                <Button onClick={onFreePractice} variant="outline">
                  {t("learnMode.freePractice", "Free Practice")}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-3xl mx-auto space-y-6">
      {/* Greeting */}
      <div className="text-center space-y-2">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold">{greeting.greeting}</h2>
        </div>
        {greeting.notes && (
          <p className="text-sm text-muted-foreground max-w-md mx-auto">{greeting.notes}</p>
        )}
      </div>

      {/* Debug info toggle when greeting is available */}
      {debugData && (
        <div className="flex justify-center">
          <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground">
                <Bug className="h-3 w-3" />
                Debug ({debugData.candidates.length} candidates)
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
        </div>
      )}

      {/* Activity Suggestions */}
      <div className="grid gap-4 md:grid-cols-2">
        {greeting.suggestions.map((suggestion) => (
          <Card
            key={suggestion.lessonKey}
            className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
            onClick={() => onSelectActivity(suggestion)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-2">
                <CardTitle className="text-base leading-tight">{suggestion.label}</CardTitle>
                <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                  <Clock className="h-3 w-3" />
                  {suggestion.durationMin} min
                </div>
              </div>
              <CardDescription className="text-sm">{suggestion.why}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="flex items-center gap-2 flex-wrap">
                {suggestion.difficulty.mode !== "same" && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    {getDifficultyIcon(suggestion.difficulty.mode)}
                    {getDifficultyLabel(suggestion.difficulty.mode)}
                  </Badge>
                )}
                {suggestion.setupHint.bpm && (
                  <Badge variant="outline" className="text-xs">
                    {suggestion.setupHint.bpm} BPM
                  </Badge>
                )}
                {suggestion.setupHint.meter && (
                  <Badge variant="outline" className="text-xs">
                    {suggestion.setupHint.meter}
                  </Badge>
                )}
              </div>
              <Button className="w-full mt-3 gap-2" size="sm">
                <Play className="h-4 w-4" />
                {t("learnMode.startLesson", "Start Lesson")}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Fallback options */}
      <div className="flex justify-center gap-3">
        <Button variant="ghost" onClick={onFreePractice}>
          {t("learnMode.freePractice", "Free Practice")}
        </Button>
      </div>
    </div>
  );
}
