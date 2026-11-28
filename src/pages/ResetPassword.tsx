import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { nativeAuthRequest } from "@/utils/nativeAuthCallback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

export default function ResetPassword() {
  const { t } = useTranslation();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success(t("auth.updated"));
      const next = new URLSearchParams(window.location.search).get("next");
      const destination = next ? new URL(next, window.location.origin) : null;
      navigate(destination?.origin === window.location.origin && destination.pathname === "/auth/native" && nativeAuthRequest(destination.search)
        ? destination.pathname + destination.search : "/");
    } catch (error) { toast.error(error instanceof Error ? error.message : t("auth.updateFailed")); }
    finally { setBusy(false); }
  };

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background text-foreground p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">{t("auth.newHeading")}</h1>
        {!loading && !user && <p role="alert">{t("auth.expiredLink")}</p>}
        <div className="space-y-1">
          <Label htmlFor="new-password">{t("auth.newPassword")}</Label>
          <Input id="new-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        <Button type="submit" disabled={busy || loading || !user} className="w-full">{t("auth.savePassword")}</Button>
      </form>
    </main>
  );
}
