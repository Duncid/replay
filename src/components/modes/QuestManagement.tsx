import { QuestEditor } from "@/components/QuestEditor";
import { TabsContent } from "@/components/ui/tabs";
import type { ReactNode } from "react";

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
  return (
    <TabsContent
      value="quest"
      className="w-full h-full flex-1 min-h-0 flex items-stretch justify-center"
    >
      <QuestEditor
        mode="embedded"
        isActive={isActive}
        onHeaderActionsChange={onHeaderActionsChange}
        onHeaderTitleChange={onHeaderTitleChange}
      />
    </TabsContent>
  );
}
