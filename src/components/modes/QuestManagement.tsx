
import { TabsContent } from "@/components/ui/tabs";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
const QuestEditor = lazy(() => import("@/components/QuestEditor").then(module => ({ default: module.QuestEditor })));

interface QuestManagementActionBarProps {
  headerActions: ReactNode;
}

export function QuestManagementActionBar({
  headerActions,
}: QuestManagementActionBarProps) {
  return <>{headerActions}</>;
}

interface QuestManagementTabContentProps {
  isActive: boolean;
  onHeaderActionsChange: (actions: ReactNode) => void;
  onHeaderTitleChange: (title: string | null) => void;
}

export function QuestManagementTabContent({
  isActive,
  onHeaderActionsChange,
  onHeaderTitleChange,
}: QuestManagementTabContentProps) {
  const [hasOpened, setHasOpened] = useState(isActive);
  useEffect(() => { if (isActive) setHasOpened(true); }, [isActive]);
  return (
    <TabsContent
      value="quest"
      forceMount
      className="w-full h-full flex-1 min-h-0 flex items-stretch justify-center"
    >
      {(hasOpened || isActive) && <Suspense fallback={<p className="p-4 text-muted-foreground">Loading editor...</p>}>
      <QuestEditor
        mode="embedded"
        isActive={isActive}
        onHeaderActionsChange={onHeaderActionsChange}
        onHeaderTitleChange={onHeaderTitleChange}
      />
      </Suspense>}
    </TabsContent>
  );
}
