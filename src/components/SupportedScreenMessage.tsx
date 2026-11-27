import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { STORAGE_KEYS } from "@/utils/storageKeys";
import { Button } from "@/components/ui/button";
import NoodlynWordmark from "@/components/landing/NoodlynWordmark";

export default function SupportedScreenMessage() {
  const { user, signOut } = useAuth();
  const [language] = useLocalStorage(STORAGE_KEYS.LANGUAGE, "en");
  const { t } = useTranslation("common", { lng: language === "fr" ? "fr" : "en" });
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const home = user ? "/?home" : "/";
  const handleSignOut = async () => {
    setPending(true);
    setFailed(false);
    try { await signOut(); }
    catch { setFailed(true); }
    finally { setPending(false); }
  };

  return <div className="noodlyn-landing flex min-h-dvh flex-col" data-screen-restriction lang={language === "fr" ? "fr" : "en"}>
    <header className="landing-header shrink-0">
      <NoodlynWordmark to={home} label={t("supportedScreen.homeLabel")} />
      {user && <Button variant="ghost" disabled={pending} onClick={() => void handleSignOut()}>{t("supportedScreen.signOut")}</Button>}
    </header>
    <main className="flex flex-1 items-center justify-center px-6 py-12">
      <div className="w-full max-w-md space-y-6 text-center">
        <h1 className="font-display text-4xl font-medium tracking-tight">{t("supportedScreen.title")}</h1>
        <p className="leading-relaxed text-[#aeb2aa]">{t("supportedScreen.description")}</p>
        <Link className="inline-flex min-h-12 items-center justify-center rounded-full bg-[#c7ff12] px-7 text-sm font-semibold text-[#131a08] transition-colors hover:bg-[#d5ff52]" to={home}>{t("supportedScreen.backHome")}</Link>
        {failed && <p role="alert" className="text-sm text-destructive">{t("supportedScreen.signOutError")}</p>}
      </div>
    </main>
  </div>;
}
