import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { AVATAR_COLORS, avatarNoteColor, type AvatarColor, type PlayerAvatarValue } from "@/utils/playerAvatar";

interface PlayerAvatarPickerProps {
  value: PlayerAvatarValue;
  onChange: (value: PlayerAvatarValue) => void;
  disabled?: boolean;
}

export function PlayerAvatarPicker({ value, onChange, disabled }: PlayerAvatarPickerProps) {
  const { t } = useTranslation();
  const [candidates] = useState(() => [value.seed, ...Array.from({ length: 5 }, () => crypto.randomUUID())]);

  return (
    <div className="flex items-center justify-center gap-6" role="group" aria-label={t("userMenu.avatar")}>
      <div className="min-w-0">
        <Select value={value.seed} onValueChange={seed => onChange({ ...value, seed })} disabled={disabled}>
          <SelectTrigger aria-label={t("userMenu.avatarCharacter")} className="h-auto w-auto gap-2 rounded-none border-0 bg-transparent p-1 shadow-none focus:ring-0 focus:ring-offset-0 [&>span]:overflow-visible [&:focus-visible_.avatar-choice]:ring-2 [&:focus-visible_.avatar-choice]:ring-ring [&:focus-visible_.avatar-choice]:ring-offset-2 [&:focus-visible_.avatar-choice]:ring-offset-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            {candidates.map((seed, index) => (
              <SelectItem key={seed} value={seed} textValue={t("userMenu.avatarCharacterName", { number: index + 1 })}>
                <span className="flex items-center gap-2">
                  <PlayerAvatar avatar={{ ...value, seed }} className="avatar-choice h-12 w-12 shrink-0" />
                  <span className="sr-only">{t("userMenu.avatarCharacterName", { number: index + 1 })}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-0">
        <Select value={value.color} onValueChange={color => onChange({ ...value, color: color as AvatarColor })} disabled={disabled}>
          <SelectTrigger aria-label={t("userMenu.avatarColor")} className="h-auto w-auto gap-2 rounded-none border-0 bg-transparent p-1 shadow-none focus:ring-0 focus:ring-offset-0 [&>span]:overflow-visible [&:focus-visible_.avatar-choice]:ring-2 [&:focus-visible_.avatar-choice]:ring-ring [&:focus-visible_.avatar-choice]:ring-offset-2 [&:focus-visible_.avatar-choice]:ring-offset-background"><SelectValue /></SelectTrigger>
          <SelectContent>
            {AVATAR_COLORS.map(color => (
              <SelectItem key={color} value={color} textValue={color}>
                <span className="flex items-center gap-2">
                  <span className="avatar-choice h-5 w-5 shrink-0 rounded-full" style={{ backgroundColor: avatarNoteColor(color) }} aria-hidden="true" />
                  <span className="sr-only">{color}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
