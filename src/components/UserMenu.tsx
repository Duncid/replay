import { NewUserDialog } from "@/components/NewUserDialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LocalUser, useLocalUsers } from "@/hooks/useLocalUsers";
import { Check, Globe, Menu, UserPlus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface UserMenuProps {
  language: string;
  onLanguageChange: (lang: string) => void;
  notationPreference: "auto" | "abc" | "solfege";
  onNotationChange: (notation: "auto" | "abc" | "solfege") => void;
}

const languageOptions = [
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "fr", label: "Français", flag: "🇫🇷" },
];

const notationOptions = [
  { value: "auto", labelKey: "language.musicNotationAuto" },
  { value: "abc", labelKey: "language.musicNotationAbc" },
  { value: "solfege", labelKey: "language.musicNotationSolfege" },
];

export function UserMenu({
  language,
  onLanguageChange,
  notationPreference,
  onNotationChange,
}: UserMenuProps) {
  const { t } = useTranslation();
  const { users, currentUser, switchUser, createUser, isLoading } =
    useLocalUsers();
  const [newUserDialogOpen, setNewUserDialogOpen] = useState(false);

  const handleCreateUser = async (name: string) => {
    await createUser(name);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="justify-between"
            aria-label={t("userMenu.menuLabel")}
          >
            <Menu className="h-4 w-4" strokeWidth={3} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56 bg-popover">
          {/* User Selection */}
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t("userMenu.switchUser")}
          </DropdownMenuLabel>
          <DropdownMenuRadioGroup
            value={currentUser?.id ?? ""}
            onValueChange={(id) => {
              console.log(`[UserSwitch] Menu selection changed to ${id}`);
              switchUser(id);
            }}
          >
            {users.map((user: LocalUser) => (
              <DropdownMenuRadioItem key={user.id} value={user.id}>
                {user.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>

          {/* New User */}
          <DropdownMenuItem onClick={() => setNewUserDialogOpen(true)}>
            <UserPlus className="h-4 w-4" />
            {t("userMenu.newUser")}
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          {/* Language Submenu */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Globe className="h-4 w-4" />
              {t("language.label")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="bg-popover">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  {t("language.musicNotation")}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="bg-popover">
                  <DropdownMenuRadioGroup
                    value={notationPreference}
                    onValueChange={(value) =>
                      onNotationChange(value as "auto" | "abc" | "solfege")
                    }
                  >
                    {notationOptions.map((option) => (
                      <DropdownMenuRadioItem key={option.value} value={option.value}>
                        {t(option.labelKey)}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              {languageOptions.map((option) => (
                <DropdownMenuItem
                  key={option.value}
                  onClick={() => onLanguageChange(option.value)}
                >
                  <span className="mr-2" aria-hidden="true">
                    {option.flag}
                  </span>
                  {option.label}
                  {language === option.value && (
                    <Check className="h-4 w-4 ml-auto" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>

      <NewUserDialog
        open={newUserDialogOpen}
        onOpenChange={setNewUserDialogOpen}
        onCreateUser={handleCreateUser}
      />
    </>
  );
}
