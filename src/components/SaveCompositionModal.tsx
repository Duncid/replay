import { useTranslation } from "react-i18next";
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SaveCompositionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (title: string) => Promise<void> | void;
  isLoading?: boolean;
  defaultTitle?: string;
}

export function SaveCompositionModal({
  open,
  onOpenChange,
  onSave,
  isLoading = false,
  defaultTitle = '',
}: SaveCompositionModalProps) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(defaultTitle);

  const handleSave = async () => {
    if (title.trim()) {
      await onSave(title.trim());
      setTitle('');
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTitle('');
    }
    onOpenChange(open);
  };

  useEffect(() => {
    if (open) {
      setTitle(defaultTitle);
    }
  }, [defaultTitle, open]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>{t("compose.saveTitle")}</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="title">{t("upload.title")}</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("compose.placeholder")}
            className="mt-2"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && title.trim()) {
                handleSave();
              }
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isLoading}>
            {t("menus.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || isLoading}>
            {isLoading ? t("compose.saving") : t("menus.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
