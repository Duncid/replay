import type { ReactNode } from "react";
import { toast as sonner } from "sonner";

export interface ToastOptions {
  title?: ReactNode;
  description?: ReactNode;
  variant?: "default" | "destructive";
  duration?: number;
}

/** Compatibility API for existing screens; Sonner owns all notification state. */
export function toast(options: ToastOptions) {
  let current = options;
  const show = (id?: string | number) => {
    const render = current.variant === "destructive" ? sonner.error : sonner;
    return render(current.title, { id, description: current.description, duration: current.duration });
  };
  const id = show();
  return {
    id,
    dismiss: () => sonner.dismiss(id),
    update: (next: Partial<ToastOptions>) => {
      current = { ...current, ...next };
      show(id);
    },
  };
}

const notifications = { toast, dismiss: sonner.dismiss };
export function useToast() {
  return notifications;
}
