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

export default function Auth({ redirectTo = window.location.origin }: { redirectTo?: string }) {
  const [mode, setMode] = useState<Mode>("signin");
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
        toast.success("Check your email to confirm your account.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password${redirectTo.includes("/auth/native?") ? `?next=${encodeURIComponent(new URL(redirectTo).pathname + new URL(redirectTo).search)}` : ""}`,
        });
        if (error) throw error;
        toast.success("Check your email for a reset link.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const oauth = async (provider: "google" | "lovable" | "apple") => {
    setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: redirectTo });
      if (result.error) throw result.error;
    } catch (error) { toast.error(error instanceof Error ? error.message : "Sign-in failed"); }
    finally { setBusy(false); }
  };

  if (isNativeApp()) return <main className="min-h-dvh flex items-center justify-center bg-background text-foreground p-6">
    <div className="w-full max-w-sm space-y-6 text-center">
      <h1 className="text-3xl font-bold">Noodlyn</h1>
      <p className="text-muted-foreground">Sign in with Apple, Google, Lovable, or email to open your music and practice profiles.</p>
      <Button className="w-full" disabled={busy} onClick={async () => {
        setBusy(true);
        try { await signInNative(); }
        catch (error) { toast.error(error instanceof Error ? error.message : 'Sign-in failed'); }
        finally { setBusy(false); }
      }}>{busy ? 'Signing in…' : 'Sign in to Noodlyn'}</Button>
      <p className="text-sm text-muted-foreground">Sign-in opens in a secure browser. You can also create an account or reset your password there.</p>
    </div>
  </main>;

  return (
    <main className="min-h-dvh flex items-center justify-center bg-background text-foreground p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-1 text-center">
          <h1 className="text-3xl font-bold">Noodlyn</h1>
          <p className="text-muted-foreground">
            {mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in to play"}
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
              Continue with Google
            </button>
            <Button type="button" variant="apple" className="w-full gap-0 py-0 pr-8" disabled={busy} onClick={() => oauth("apple")}>
              <img src={appleLogo.url} alt="" className="h-10 w-auto shrink-0" />
              Continue with Apple
            </Button>
            <Button type="button" variant="outline" className="w-full" disabled={busy} onClick={() => oauth("lovable")}>
              Continue with Lovable
            </Button>
            <div className="text-center text-xs text-muted-foreground pt-2">or</div>
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {mode !== "forgot" && (
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          )}
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
          </Button>
        </form>

        <div className="flex justify-between text-sm text-muted-foreground">
          {mode === "signin" ? (
            <>
              <button type="button" onClick={() => setMode("signup")}>Create account</button>
              <button type="button" onClick={() => setMode("forgot")}>Forgot password?</button>
            </>
          ) : (
            <button type="button" onClick={() => setMode("signin")}>Back to sign in</button>
          )}
        </div>
      </div>
    </main>
  );
}
