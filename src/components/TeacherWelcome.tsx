import { Badge } from "@/components/ui/badge";
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
}

export function TeacherWelcome({
  greeting,
  isLoading,
  onSelectActivity,
}: TeacherWelcomeProps) {
  const { t } = useTranslation();

  let content: React.ReactNode = null;

  // If greeting is available, show the suggestions UI (lesson selection)
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
  } else {
    // Loading: fetching teacher greeting (go straight to lesson selection)
    content = <LoadingSpinner message={t("learnMode.loadingTeacher")} />;
  }

  return <div className="w-full">{content}</div>;
}
