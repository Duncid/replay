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
import { useState } from "react";
import { useTranslation } from "react-i18next";

interface NewUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateUser: (name: string) => Promise<void>;
}

export function NewUserDialog({
  open,
  onOpenChange,
  onCreateUser,
}: NewUserDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsCreating(true);
    await onCreateUser(name.trim());
    setIsCreating(false);
    setName("");
    onOpenChange(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setName("");
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[320px]">
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
