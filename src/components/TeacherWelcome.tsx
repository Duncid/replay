import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TeacherGreetingResponse, TeacherSuggestion } from "@/types/learningSession";
import { Clock, Play, Sparkles, TrendingUp, RotateCcw, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";

interface TeacherWelcomeProps {
  greeting: TeacherGreetingResponse | null;
  isLoading: boolean;
  onSelectActivity: (suggestion: TeacherSuggestion) => void;
  onFreePractice: () => void;
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
}: TeacherWelcomeProps) {
  const { t } = useTranslation();

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

  if (!greeting) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <Card className="border-destructive/20">
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <p className="text-muted-foreground">{t("learnMode.teacherUnavailable", "Couldn't load teacher suggestions.")}</p>
            <Button onClick={onFreePractice} variant="outline">
              {t("learnMode.freePractice", "Free Practice")}
            </Button>
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
