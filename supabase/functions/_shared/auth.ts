import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export class AuthError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** Validates the caller's sign-in and returns their user id plus a service client. */
export async function requireUser(req: Request): Promise<{ userId: string; admin: SupabaseClient }> {
  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new AuthError("Sign in required", 401);
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) throw new AuthError("Sign in required", 401);
  return { userId: data.user.id, admin };
}

export async function requireAdmin(req: Request) {
  const ctx = await requireUser(req);
  const { data } = await ctx.admin.from("user_roles").select("role").eq("user_id", ctx.userId).eq("role", "admin").maybeSingle();
  if (!data) throw new AuthError("Admin only", 403);
  return ctx;
}

/** Returns the practice profile id if it belongs to the caller, else their first profile. */
export async function resolveProfile(admin: SupabaseClient, userId: string, requested?: string | null): Promise<string | null> {
  const { data } = await admin.from("local_users").select("id").eq("auth_user_id", userId).order("created_at");
  const ids = (data ?? []).map((r: { id: string }) => r.id);
  if (requested && ids.includes(requested)) return requested;
  if (requested && !ids.includes(requested)) throw new AuthError("Not your profile", 403);
  return ids[0] ?? null;
}

export function authErrorResponse(err: unknown, headers: Record<string, string>): Response | null {
  if (err instanceof AuthError) {
    return new Response(JSON.stringify({ error: err.message }), { status: err.status, headers: { ...headers, "Content-Type": "application/json" } });
  }
  return null;
}
