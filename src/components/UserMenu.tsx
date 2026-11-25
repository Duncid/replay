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
import { Check, Globe, Menu, UserPlus, GitBranch, Music2, LogOut, Upload, Pencil } from "lucide-react";
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
  onOpenManagement?: (mode: "quest" | "lab") => void;
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
  onOpenManagement,
  debugMode,
  onDebugModeChange,
}: UserMenuProps) {
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
              <div key={user.id} className="flex items-center gap-1">
                <DropdownMenuRadioItem value={user.id} className="min-w-0 flex-1 gap-2">
                  <PlayerAvatar avatar={getPlayerAvatar(user)} />
                  <span className="truncate">{user.name}</span>
                </DropdownMenuRadioItem>
                <DropdownMenuItem
                  aria-label={t("userMenu.editPlayerName", { name: user.name })}
                  className="shrink-0 p-2 text-muted-foreground"
                  onSelect={() => setEditingPlayer(user)}
                >
                  <Pencil className="h-4 w-4" />
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuRadioGroup>

          {/* New User */}
          <DropdownMenuItem className="mt-1 bg-secondary text-secondary-foreground focus:bg-secondary/80" onSelect={() => setNewUserDialogOpen(true)}>
            <UserPlus className="h-4 w-4" />
            {t("userMenu.newUser")}
          </DropdownMenuItem>

          {user && !isAdmin && (
            <DropdownMenuItem onSelect={() => uploadInputRef.current?.click()}>
              <Upload className="h-4 w-4" />
              Upload new tune…
            </DropdownMenuItem>
          )}

          <DropdownMenuSeparator />

          {onOpenManagement && isAdmin && (
            <>
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Admin
              </DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem onSelect={() => onOpenManagement("quest")}>
                  <GitBranch className="h-4 w-4" />
                  Quest
                </DropdownMenuItem>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <Music2 className="h-4 w-4" />
                    Tune Management
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="bg-popover">
                    <TuneSelectionSubmenus
                      onSelected={() => onOpenManagement?.("lab")}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => uploadInputRef.current?.click()}>
                      <Upload className="h-4 w-4" />
                      Upload new tune…
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuCheckboxItem checked={debugMode} onCheckedChange={onDebugModeChange}>
                  Debug
                </DropdownMenuCheckboxItem>
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

          {user && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
                {user.email}
              </DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => { void signOut().catch(error => toast.error(error.message)); }}>
                <LogOut className="h-4 w-4" />
                Sign out
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
