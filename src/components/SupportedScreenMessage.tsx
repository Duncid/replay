import { useState } from "react";
import { Monitor, Tablet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { Button } from "@/components/ui/button";

export default function SupportedScreenMessage() {
  const { signOut } = useAuth();
  const [language] = useLocalStorage(STORAGE_KEYS.LANGUAGE, "en");
  const { t } = useTranslation("common", { lng: language === "fr" ? "fr" : "en" });
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const handleSignOut = async () => {
    setPending(true);
    setFailed(false);
    try { await signOut(); }
    catch { setFailed(true); }
    finally { setPending(false); }
  };

  return <main className="flex min-h-dvh items-center justify-center bg-background px-6 py-12 text-foreground" lang={language === "fr" ? "fr" : "en"}>
    <div className="w-full max-w-md space-y-6 text-center">
      <div className="flex items-end justify-center gap-3 text-muted-foreground" aria-hidden="true">
        <Monitor size={44} strokeWidth={1.5} /><Tablet size={32} strokeWidth={1.5} />
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">{t("supportedScreen.title")}</h1>
      <p className="leading-relaxed text-muted-foreground">{t("supportedScreen.description")}</p>
      <Button variant="outline" disabled={pending} onClick={() => void handleSignOut()}>{t("supportedScreen.signOut")}</Button>
      {failed && <p role="alert" className="text-sm text-destructive">{t("supportedScreen.signOutError")}</p>}
    </div>
  </main>;
}
