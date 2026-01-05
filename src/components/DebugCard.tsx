import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReactNode } from "react";

interface DebugCardProps {
  title: string;
  content: ReactNode;
  actions: ReactNode;
}

export function DebugCard({ title, content, actions }: DebugCardProps) {
  return (
    <div className="w-full max-w-xl mx-auto">
      <Card className="border-none bg-amber-950/50">
        <CardHeader className="pb-3">
          <span className="text-xs uppercase text-amber-400/60">Debug</span>
          <CardTitle className="text-lg">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {content}
          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-4 border-t border-amber-200/10">
            {actions}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
