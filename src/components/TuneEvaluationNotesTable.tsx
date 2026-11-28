import { useTranslation } from "react-i18next";
import type { TuneEvaluationDebugData } from "@/types/tunePractice";

interface TuneEvaluationNotesTableProps {
  debugData?: TuneEvaluationDebugData | null;
}

export function TuneEvaluationNotesTable({
  debugData,
}: TuneEvaluationNotesTableProps) {
  const { t } = useTranslation();
  const targetNotes =
    (debugData?.targetSequence as { notes?: unknown[] })?.notes || [];
  const userNotes =
    (debugData?.userSequence as { notes?: unknown[] })?.notes || [];

  const formatNumber = (value: unknown) => {
    if (typeof value !== "number" || Number.isNaN(value)) return "-";
    return Number.isInteger(value) ? `${value}` : value.toFixed(3);
  };

  const rowCount = Math.max(targetNotes.length, userNotes.length);

  return (
    <div>
      <h4 className="text-sm font-medium mb-1">{t("notesTable.heading")}</h4>
      <div className="border border-border rounded overflow-auto max-h-48">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 text-muted-foreground sticky top-0">
            <tr>
              <th className="text-left font-medium px-2 py-1 w-10">#</th>
              <th className="text-left font-medium px-2 py-1 text-blue-500">
                {t("notesTable.targetPitch")}
              </th>
              <th className="text-left font-medium px-2 py-1 text-accent-foreground">
                {t("notesTable.userPitch")}
              </th>
              <th className="text-left font-medium px-2 py-1 text-blue-500">
                {t("notesTable.targetStart")}
              </th>
              <th className="text-left font-medium px-2 py-1 text-accent-foreground">
                {t("notesTable.userStart")}
              </th>
              <th className="text-left font-medium px-2 py-1 text-blue-500">
                {t("notesTable.targetEnd")}
              </th>
              <th className="text-left font-medium px-2 py-1 text-accent-foreground">
                {t("notesTable.userEnd")}
              </th>
              <th className="text-left font-medium px-2 py-1 text-blue-500">
                {t("notesTable.targetVelocity")}
              </th>
              <th className="text-left font-medium px-2 py-1 text-accent-foreground">
                {t("notesTable.userVelocity")}
              </th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {rowCount === 0 && (
              <tr>
                <td className="px-2 py-2 text-muted-foreground" colSpan={9}>
                  {t("notesTable.empty")}
                </td>
              </tr>
            )}
            {Array.from({ length: rowCount }).map((_, index) => {
              const targetNote = targetNotes[index] as
                | {
                    pitch?: number;
                    startTime?: number;
                    endTime?: number;
                    velocity?: number;
                  }
                | undefined;
              const userNote = userNotes[index] as
                | {
                    pitch?: number;
                    startTime?: number;
                    endTime?: number;
                    velocity?: number;
                  }
                | undefined;

              return (
                <tr key={index} className="border-t border-border/50">
                  <td className="px-2 py-1">{index + 1}</td>
                  <td className="px-2 py-1">
                    {formatNumber(targetNote?.pitch)}
                  </td>
                  <td className="px-2 py-1">
                    {formatNumber(userNote?.pitch)}
                  </td>
                  <td className="px-2 py-1">
                    {formatNumber(targetNote?.startTime)}
                  </td>
                  <td className="px-2 py-1">
                    {formatNumber(userNote?.startTime)}
                  </td>
                  <td className="px-2 py-1">
                    {formatNumber(targetNote?.endTime)}
                  </td>
                  <td className="px-2 py-1">
                    {formatNumber(userNote?.endTime)}
                  </td>
                  <td className="px-2 py-1">
                    {formatNumber(targetNote?.velocity)}
                  </td>
                  <td className="px-2 py-1">
                    {formatNumber(userNote?.velocity)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
