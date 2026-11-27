import { ChevronDown, SlidersVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup,
  DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PIANO_SOUND_LABELS, SAMPLED_INSTRUMENTS, type PianoSoundType } from "@/hooks/usePianoSound";

export type DisplayNotesPreference = "auto" | "always" | "never";

interface KeyboardSettingsProps {
  instrument: PianoSoundType;
  onInstrumentChange: (instrument: PianoSoundType) => void;
  displayNotes: DisplayNotesPreference;
  onDisplayNotesChange: (value: DisplayNotesPreference) => void;
}

export function KeyboardSettings({ instrument, onInstrumentChange, displayNotes, onDisplayNotesChange }: KeyboardSettingsProps) {
  const { t } = useTranslation();
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="sm" aria-label={t("piano.settings")} title={t("piano.settings")}>
        <SlidersVertical aria-hidden="true" />
        <ChevronDown aria-hidden="true" className="size-4 opacity-50" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="top" align="start" className="w-56 max-h-(--radix-dropdown-menu-content-available-height) overflow-y-auto" aria-label={t("piano.settings")}>
      <DropdownMenuLabel>{t("piano.instrument")}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={instrument} onValueChange={value => onInstrumentChange(value as PianoSoundType)} aria-label={t("piano.instrument")}>
        {([...SAMPLED_INSTRUMENTS, "classic"] as PianoSoundType[]).map(sound =>
          <DropdownMenuRadioItem key={sound} value={sound}>{PIANO_SOUND_LABELS[sound]}</DropdownMenuRadioItem>
        )}
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>{t("piano.displayNotes")}</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup value={displayNotes} onValueChange={value => onDisplayNotesChange(value as DisplayNotesPreference)} aria-label={t("piano.displayNotes")}>
            {(["auto", "always", "never"] as const).map(value =>
              <DropdownMenuRadioItem key={value} value={value}>{t(`piano.displayNotesOptions.${value}`)}</DropdownMenuRadioItem>
            )}
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </DropdownMenuContent>
  </DropdownMenu>;
}
