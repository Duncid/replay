import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { LocalUser } from "@/hooks/useLocalUsers";
import { PlayerAvatarPicker } from "@/components/PlayerAvatarPicker";
import { getPlayerAvatar, type PlayerAvatarValue } from "@/utils/playerAvatar";

interface EditPlayerDialogProps {
  player: LocalUser;
  onClose: () => void;
  onSave: (id: string, name: string, avatar: PlayerAvatarValue) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function EditPlayerDialog({ player, onClose, onSave, onDelete }: EditPlayerDialogProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(player.name);
  const [avatar, setAvatar] = useState(() => getPlayerAvatar(player));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const originalAvatar = getPlayerAvatar(player);
  const dirty = name !== player.name || avatar.seed !== originalAvatar.seed || avatar.color !== originalAvatar.color;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending || !name.trim() || !dirty) return;
    setPending(true);
    setError(null);
    try {
      await onSave(player.id, name.trim(), avatar);
      onClose();
    } catch {
      setError(t("userMenu.saveError"));
    } finally {
      setPending(false);
    }
  };

  const remove = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      await onDelete(player.id);
      onClose();
    } catch {
      setError(t("userMenu.deleteError"));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] overflow-y-auto sm:max-w-md">
        <form onSubmit={save}>
          <DialogHeader>
            <DialogTitle>{t("userMenu.editPlayer")}</DialogTitle>
            <DialogDescription>{t("userMenu.editPlayerDescription")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <Label htmlFor="playerName">{t("userMenu.nameLabel")}</Label>
            <Input id="playerName" value={name} onChange={(event) => setName(event.target.value)} disabled={pending} autoFocus />
            <div className="pt-3"><PlayerAvatarPicker value={avatar} onChange={setAvatar} disabled={pending} /></div>
            {error && !confirmDelete && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter className="gap-2 sm:space-x-0">
            <Button type="button" variant="destructive" className="sm:mr-auto" disabled={pending}
              onClick={() => { setError(null); setConfirmDelete(true); }}>
              <Trash2 className="h-4 w-4" />{t("userMenu.delete")}
            </Button>
            {dirty ? <>
              <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{t("menus.cancel")}</Button>
              <Button type="submit" disabled={pending || !name.trim()}>{t("menus.save")}</Button>
            </> : <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{t("userMenu.close")}</Button>}
          </DialogFooter>
        </form>
        <AlertDialog open={confirmDelete} onOpenChange={(open) => { if (!pending) { setConfirmDelete(open); setError(null); } }}>
          <AlertDialogContent className="sm:max-w-sm">
            <AlertDialogHeader>
              <AlertDialogTitle>{t("userMenu.deletePlayer")}</AlertDialogTitle>
              <AlertDialogDescription>{t("userMenu.deletePlayerConfirmation", { name: player.name })}</AlertDialogDescription>
            </AlertDialogHeader>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={pending}>{t("menus.cancel")}</AlertDialogCancel>
              <Button variant="destructive" onClick={remove} disabled={pending}>{t("userMenu.delete")}</Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
