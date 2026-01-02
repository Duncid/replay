import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  TeacherGreetingResponse,
  TeacherSuggestion,
} from "@/types/learningSession";
import { Music } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PracticePlanDebugCard } from "./PracticePlanDebugCard";
import { LoadingSpinner } from "./LoadingSpinner";

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
  debugMode?: boolean;
}

export function TeacherWelcome({
  greeting,
  isLoading,
  onSelectActivity,
  onStart,
  language = "en",
  localUserId,
  debugMode = false,
}: TeacherWelcomeProps) {
  const { t } = useTranslation();
  const [debugData, setDebugData] = useState<TeacherDebugData | null>(null);
  const [isLoadingDebug, setIsLoadingDebug] = useState(false);
  const [debugError, setDebugError] = useState<string | null>(null);

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

  // Fetch debug data on mount (only in debug mode)
  useEffect(() => {
    if (debugMode) {
      fetchDebugData();
    }
  }, [fetchDebugData, debugMode]);

  const handleProceedFromDebug = useCallback(() => {
    onStart();
  }, [onStart]);

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
      <LoadingSpinner message={t("learnMode.loadingTeacher", "Preparing your lesson...")} />
    );
  }

  // Debug Card - shown by default before Start is clicked (only in debug mode)
  if (debugMode) {
    if (isLoadingDebug) {
      return (
        <LoadingSpinner message="Loading curriculum and activity data..." />
      );
    }

    if (debugError) {
      return (
        <div className="w-full max-w-3xl mx-auto space-y-6">
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardContent className="pt-6">
              <div className="flex flex-col gap-2">
                <p className="text-destructive">Error: {debugError}</p>
                <Button variant="outline" size="sm" onClick={fetchDebugData}>
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    if (debugData) {
      return (
        <PracticePlanDebugCard
          debugData={debugData}
          onProceed={handleProceedFromDebug}
        />
      );
    }
  }

  // Normal mode - just show Start button
  return (
    <div className="w-full max-w-3xl h-full flex flex-col justify-center items-center mx-auto space-y-6">
      <Button onClick={onStart}>Start</Button>
    </div>
  );
}
