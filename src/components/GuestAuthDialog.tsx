import Auth from "@/pages/Auth";
import { useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

export function GuestAuthDialog({ open, mode, onOpenChange }: { open: boolean; mode: "signin" | "signup"; onOpenChange: (open: boolean) => void }) {
  const returnFocus = useRef<HTMLElement | null>(null);
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl px-6 pb-8 pt-10 sm:px-8" aria-describedby={undefined}
      onOpenAutoFocus={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }}
      onCloseAutoFocus={event => { event.preventDefault(); returnFocus.current?.focus(); }}>
      <DialogTitle className="sr-only">{mode === "signup" ? "Create account" : "Sign in"}</DialogTitle>
      <Auth key={mode} initialMode={mode} embedded />
    </DialogContent>
  </Dialog>;
}
