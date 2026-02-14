import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  TeacherGreetingResponse,
  TeacherSuggestion,
} from "@/types/learningSession";
import { useTranslation } from "react-i18next";
import { LoadingSpinner } from "./LoadingSpinner";

interface TeacherWelcomeProps {
  greeting: TeacherGreetingResponse | null;
  isLoading: boolean;
  onSelectActivity: (suggestion: TeacherSuggestion) => void;
  onStart: () => void;
}

export function TeacherWelcome({
  greeting,
  isLoading,
  onSelectActivity,
  onStart,
}: TeacherWelcomeProps) {
  const { t } = useTranslation();

  let content: React.ReactNode = null;

  // If greeting is available, show the suggestions UI
  if (greeting) {
    content = (
      <div className="space-y-6">
        {/* Greeting */}
        <div className="text-left space-y-2 max-w-4xl  mx-auto">
          <h2 className="text-xl">{greeting.greeting}</h2>
          {greeting.notes && (
            <p className="text-sm text-muted-foreground">
              {greeting.notes}
            </p>
          )}
        </div>

        {/* Activity Suggestions */}
        <div className="overflow-x-auto pb-2 custom-scrollbar">
          <div className="flex justify-center gap-4 w-max min-w-full">
          {greeting.suggestions.map((suggestion) => (
            <Card
              key={suggestion.activityKey}
              className="min-w-[260px] max-w-[300px] flex-shrink-0 cursor-pointer transition-all hover:border-primary/50 hover:shadow-md"
              onClick={() => onSelectActivity(suggestion)}
            >
              <CardHeader>
                <Badge
                  variant="outline"
                  className="w-fit text-xs uppercase tracking-wide"
                >
                  {suggestion.activityType === "tune" ? "Tune" : "Lesson"}
                </Badge>
                <CardTitle className="text-base leading-tight mt-2">
                  {suggestion.label}
                </CardTitle>
                <CardDescription className="text-sm">
                  {suggestion.why}
                </CardDescription>
              </CardHeader>
            </Card>
          ))}
          </div>
        </div>
      </div>
    );
  } else if (isLoading) {
    // Loading state for initial greeting fetch (after Start is clicked)
    content = <LoadingSpinner message={t("learnMode.loadingTeacher")} />;
  } else {
    // Normal mode - just show Start button
    content = (
      <div className="h-full flex flex-col justify-center items-center space-y-6">
        <Button onClick={onStart}>{t("learnMode.startButton")}</Button>
      </div>
    );
  }

  return <div className="w-full">{content}</div>;
}
