import { useState } from 'react';
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
  onSave: (title: string) => void;
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
  const [title, setTitle] = useState(defaultTitle);

  const handleSave = () => {
    if (title.trim()) {
      onSave(title.trim());
      setTitle('');
    }
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setTitle('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Save Composition</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My composition"
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
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!title.trim() || isLoading}>
            {isLoading ? 'Saving...' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
