import { useLanguage } from "@/contexts/LanguageContext";
import { languageName } from "@/lib/languages";
import { NewUserDialog } from "@/components/NewUserDialog";
import { EditPlayerDialog } from "@/components/EditPlayerDialog";
import { PlayerAvatar } from "@/components/PlayerAvatar";
import { getPlayerAvatar, type PlayerAvatarValue } from "@/utils/playerAvatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuCheckboxItem,
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
import { TuneSelectionSubmenus } from "@/components/modes/TuneManagement";
import { TuneUploadDialog } from "@/components/TuneUploadDialog";
import { Check, Globe, UserRound, UserPlus, GitBranch, Music2, LogOut, Upload, Pencil, Music } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";

interface UserMenuProps {
  language: string;
  onLanguageChange: (lang: string) => void;
  notationPreference: "auto" | "abc" | "solfege";
  onNotationChange: (notation: "auto" | "abc" | "solfege") => void;
  debugMode: boolean;
  onDebugModeChange: (enabled: boolean) => void;
  onOpenMode?: (mode: "quest" | "lab" | "play" | "languages") => void;
}

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
  onOpenMode,
  debugMode,
  onDebugModeChange,
}: UserMenuProps) {
  const { languages } = useLanguage();
  const { t } = useTranslation();
  const { users, currentUser, switchUser, createUser, updateUser, deleteUser } =
    useLocalUsers();
  const { user, isAdmin, signOut } = useAuth();
  const [newUserDialogOpen, setNewUserDialogOpen] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<LocalUser | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const handleCreateUser = async (name: string, avatar: PlayerAvatarValue) => {
    await createUser(name, avatar);
  };

  return (
    <>
      {user && (
        <>
          {/* Upload goes straight to the file picker; naming and progress follow in the dialog. */}
          <input ref={uploadInputRef} type="file" accept=".mxl,.xml,.musicxml" className="hidden" data-testid="tune-upload-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) { setUploadFile(f); setUploadOpen(true); }
            }} />
          <TuneUploadDialog open={uploadOpen} onOpenChange={setUploadOpen} file={uploadFile} />
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={t("userMenu.menuLabel")}
          >
            {currentUser
              ? <PlayerAvatar avatar={getPlayerAvatar(currentUser)} />
              : <UserRound className="h-4 w-4" />}
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
              <div key={user.id} className="group/player flex items-center gap-1">
                <DropdownMenuRadioItem value={user.id} showIndicator={false} className="min-w-0 flex-1 gap-2">
                  <PlayerAvatar avatar={getPlayerAvatar(user)} />
                  <span className="truncate">{user.name}</span>
                </DropdownMenuRadioItem>
                <DropdownMenuItem
                  aria-label={t("userMenu.editPlayerName", { name: user.name })}
                  className="shrink-0 p-2 text-muted-foreground [@media(hover:hover)]:opacity-0 group-hover/player:opacity-100 group-has-[:focus-visible]/player:opacity-100"
                  onSelect={() => setEditingPlayer(user)}
                >
                  <Pencil className="h-4 w-4" />
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuRadioGroup>

          {/* New User */}
          <DropdownMenuItem className="mt-1 text-muted-foreground" onSelect={() => setNewUserDialogOpen(true)}>
            <UserPlus className="h-4 w-4" />
            {t("userMenu.newUser")}
          </DropdownMenuItem>

          {user && !isAdmin && (
            <DropdownMenuItem onSelect={() => uploadInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              {t("management.upload")}
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {onOpenMode && isAdmin && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("management.admin")}
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => onOpenMode("quest")}>
                  <GitBranch className="h-4 w-4" />
                  {t("management.quest")}
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Music2 className="h-4 w-4" />
                    {t("management.tunes")}
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-popover">
                    <TuneSelectionSubmenus
                      onSelected={() => onOpenMode?.("lab")}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => uploadInputRef.current?.click()}>
                      <Upload className="h-4 w-4" />
                      {t("management.upload")}
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onSelect={() => onOpenMode("languages")}>
                  <Globe className="h-4 w-4" />
                  {t("languageManager.title")}
                </DropdownMenuItem>
                <DropdownMenuCheckboxItem checked={debugMode} onCheckedChange={onDebugModeChange}>
                  {t("management.debug")}
                </DropdownMenuCheckboxItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {t("userMenu.beta")}
              </DropdownMenuLabel>
              <DropdownMenuGroup aria-label={t("userMenu.beta")}>
                <DropdownMenuItem onSelect={() => onOpenMode("play")}>
                  <Music className="h-4 w-4" />
                  {t("tabs.play")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          )}

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
              {languages.map((option) => (
                <DropdownMenuItem
                  key={option.locale}
                  onClick={() => onLanguageChange(option.locale)}
                >
                  {languageName(option.locale)}
                  {language === option.locale && (
                    <Check className="h-4 w-4 ml-auto" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {user && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
                {user.email}
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => { void signOut().catch(error => toast.error(error.message)); }}>
                <LogOut className="h-4 w-4" />
                {t("supportedScreen.signOut")}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <NewUserDialog
        open={newUserDialogOpen}
        onOpenChange={setNewUserDialogOpen}
        onCreateUser={handleCreateUser}
      />
      {editingPlayer && (
        <EditPlayerDialog
          key={editingPlayer.id}
          player={editingPlayer}
          onClose={() => setEditingPlayer(null)}
          onSave={updateUser}
          onDelete={deleteUser}
        />
      )}
    </>
  );
}
