/** Who may change a tune. System tunes (is_global) belong to Noodlyn: only admins edit them. */
export interface TuneRow { owner_user_id: string | null; is_global: boolean }
export type TuneAction = "rename" | "delete" | "promote" | "demote" | "replace-system";

export function canManageTune(action: TuneAction, tune: TuneRow, userId: string, isAdmin: boolean): boolean {
  if (action === "promote" || action === "demote" || action === "replace-system") return isAdmin;
  if (tune.is_global) return isAdmin;
  return isAdmin || tune.owner_user_id === userId;
}

/** Replacing a System tune needs a System target and a source tune from the admin's own account library. */
export function canReplaceSystemTune(target: TuneRow, source: TuneRow, userId: string, isAdmin: boolean): boolean {
  return isAdmin && target.is_global && !source.is_global && source.owner_user_id === userId;
}
