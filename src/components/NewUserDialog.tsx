import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerAvatarPicker } from "@/components/PlayerAvatarPicker";
import { newPlayerAvatar, type PlayerAvatarValue } from "@/utils/playerAvatar";
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface NewUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateUser: (name: string, avatar: PlayerAvatarValue) => Promise<void>;
}

export function NewUserDialog({
  open,
  onOpenChange,
  onCreateUser,
}: NewUserDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState(newPlayerAvatar);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || isCreating) return;

    setIsCreating(true);
    setError(null);
    try {
      await onCreateUser(name.trim(), avatar);
      reset();
      onOpenChange(false);
    } catch {
      setError(t("userMenu.createError"));
    } finally {
      setIsCreating(false);
    }
  };

  const reset = () => {
    setName("");
    setAvatar(newPlayerAvatar());
    setError(null);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (isCreating) return;
    if (!newOpen) reset();
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{t("userMenu.newUser")}</DialogTitle>
            <DialogDescription>
              {t("userMenu.newUserDescription")}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="userName" className="sr-only">
              {t("userMenu.nameLabel")}
            </Label>
            <Input
              id="userName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("userMenu.namePlaceholder")}
              autoFocus
              disabled={isCreating}
            />
            <div className="pt-4"><PlayerAvatarPicker value={avatar} onChange={setAvatar} disabled={isCreating} /></div>
            {error && <p role="alert" className="pt-2 text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isCreating}
            >
              {t("menus.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim() || isCreating}>
              {t("userMenu.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
