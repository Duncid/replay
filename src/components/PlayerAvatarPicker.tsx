import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { cn } from "@/lib/utils";
import { AVATAR_COLORS, avatarNoteColor, type PlayerAvatarValue } from "@/utils/playerAvatar";

interface PlayerAvatarPickerProps {
  value: PlayerAvatarValue;
  onChange: (value: PlayerAvatarValue) => void;
  disabled?: boolean;
}

export function PlayerAvatarPicker({ value, onChange, disabled }: PlayerAvatarPickerProps) {
  const { t } = useTranslation();
  const [candidates, setCandidates] = useState(() => [value.seed, ...Array.from({ length: 5 }, () => crypto.randomUUID())]);

  return (
    <div className="space-y-4" role="group" aria-label={t("userMenu.avatar")}>
      <div className="flex items-center gap-4">
        <PlayerAvatar avatar={value} className="h-20 w-20" alt={t("userMenu.selectedAvatar")} />
        <p className="text-sm text-muted-foreground">{t("userMenu.avatarDescription")}</p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("userMenu.avatarColor")}</p>
        <div className="grid grid-cols-6 gap-1" role="group" aria-label={t("userMenu.avatarColor")}>
          {AVATAR_COLORS.map(color => (
            <Button key={color} type="button" variant="ghost" disabled={disabled}
              className="h-auto min-h-11 min-w-0 flex-col gap-1 px-1 py-2"
              aria-label={t("userMenu.avatarColorName", { color })} aria-pressed={value.color === color}
              onClick={() => onChange({ ...value, color })}>
              <span className={cn("rounded-full p-0.5", value.color === color && "ring-2")}
                style={{ "--tw-ring-color": avatarNoteColor(color) } as React.CSSProperties}>
                <PlayerAvatar avatar={{ ...value, color }} className="h-auto w-full max-w-12" />
              </span>
              <span className="text-xs">{color}</span>
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t("userMenu.avatarCharacter")}</p>
          <Button type="button" variant="ghost" size="sm" disabled={disabled}
            onClick={() => setCandidates(Array.from({ length: 6 }, () => crypto.randomUUID()))}>
            <Shuffle className="h-4 w-4" />{t("userMenu.avatarShuffle")}
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label={t("userMenu.avatarCharacter")}>
          {candidates.map((seed, index) => (
            <Button key={seed} type="button" variant="ghost" disabled={disabled}
              className={cn("h-auto min-w-0 rounded-xl bg-muted p-2", value.seed === seed && "ring-2 ring-primary")}
              aria-label={t("userMenu.avatarCharacterName", { number: index + 1 })} aria-pressed={value.seed === seed}
              onClick={() => onChange({ ...value, seed })}>
              <PlayerAvatar avatar={{ ...value, seed }} className="h-auto w-full max-w-16" />
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
