import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { useState, type FormEvent } from "react";
import { isNativeApp, signInNative } from "@/lib/nativeAuth";
import { toast } from "sonner";
import appleLogo from "@/assets/auth/apple-sign-in-black.svg.asset.json";

const GoogleLogo = () => (
  <svg aria-hidden="true" width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
);

type Mode = "signin" | "signup" | "forgot";

export default function Auth({ redirectTo = window.location.origin, initialMode = "signin", embedded = false }: { redirectTo?: string; initialMode?: "signin" | "signup"; embedded?: boolean }) {
  const { t } = useTranslation();
  const Surface = embedded ? "div" : "main";
  const surfaceClass = embedded ? "flex justify-center text-foreground" : "min-h-dvh flex items-center justify-center bg-background text-foreground p-6";
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: redirectTo },
        });
        if (error) throw error;
        toast.success(t("auth.checkEmail"));
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password${redirectTo.includes("/auth/native?") ? `?next=${encodeURIComponent(new URL(redirectTo).pathname + new URL(redirectTo).search)}` : ""}`,
        });
        if (error) throw error;
        toast.success(t("auth.checkReset"));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("auth.error"));
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: "google" | "lovable" | "apple") => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: redirectTo });
      if (result.error) throw result.error;
    } catch (error) { toast.error(error instanceof Error ? error.message : t("auth.failed")); }
    finally { setBusy(false); }
  };

  if (isNativeApp()) return <Surface className={surfaceClass}>
    <div className="w-full max-w-sm space-y-6 text-center">
      <h1 className="text-3xl font-bold">Noodlyn</h1>
      <p className="text-muted-foreground">{t("auth.nativeIntro")}</p>
      <Button className="w-full" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await signInNative(); }
        catch (error) { toast.error(error instanceof Error ? error.message : t("auth.failed")); }
        finally { setBusy(false); }
      }}>{busy ? t("auth.signingIn") : t("auth.signInNoodlyn")}</Button>
      <p className="text-sm text-muted-foreground">{t("auth.secure")}</p>
    </div>
  </Surface>;

  return (
    <Surface className={surfaceClass}>
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-3xl font-bold">Noodlyn</h1>
          <p className="text-muted-foreground">
            {mode === "signup" ? t("auth.createHeading") : mode === "forgot" ? t("auth.resetHeading") : t("auth.playHeading")}
          </p>
        </div>

        {mode !== "forgot" && (
          <div className="space-y-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => oauth("google")}
              className="w-full h-10 rounded-md flex items-center justify-center gap-[10px] px-3 text-sm font-medium border"
              style={{ background: "#131314", borderColor: "#8E918F", color: "#E3E3E3" }}
            >
              <GoogleLogo />
              {t("auth.provider", { provider: "Google" })}
            </button>
            <Button type="button" variant="apple" className="w-full gap-0 py-0 pr-8" disabled={busy} onClick={() => oauth("apple")}>
              <img src={appleLogo.url} alt="" className="h-10 w-auto shrink-0" />
              {t("auth.provider", { provider: "Apple" })}
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => oauth("lovable")}>
              {t("auth.provider", { provider: "Lovable" })}
            </Button>
            <div className="text-center text-xs text-muted-foreground pt-2">{t("auth.or")}</div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-1">
              <Label htmlFor="password">{t("auth.password")}</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? t("auth.signIn") : mode === "signup" ? t("auth.create") : t("auth.sendLink")}
          </Button>
        </form>

        <div className="flex justify-between text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>
              <button type="button" onClick={() => setMode("signup")}>{t("auth.create")}</button>
              <button type="button" onClick={() => setMode("forgot")}>{t("auth.forgot")}</button>
            </>
          ) : (
            <button type="button" onClick={() => setMode("signin")}>{t("auth.back")}</button>
          )}
        </div>
      </div>
    </Surface>
  );
}
