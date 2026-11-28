import { useTranslation } from "react-i18next";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Link, useSearchParams, useLocation } from "react-router-dom";
import { lazy, Suspense } from "react";
import GuestEntry from "./components/landing/GuestEntry";
import NativeAuth from "./pages/NativeAuth";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { useSupportedScreen } from "./hooks/useSupportedScreen";
import SupportedScreenMessage from "./components/SupportedScreenMessage";

const Index = lazy(() => import("./pages/Index"));

function Loading() {
  const { t } = useTranslation();
  return <div className="h-dvh flex items-center justify-center bg-background text-foreground">{t("library.loadingMusic")}</div>;
}

function PublicEntry() {
  const { user, loading } = useAuth();
  const supportedScreen = useSupportedScreen();
  const { pathname, search } = useLocation();
  if (loading) return <Loading />;
  // Signed-in visitors can return to the public homepage without signing out.
  const homepage = pathname === "/" && (!user || new URLSearchParams(search).has("home"));
  if (homepage) return <GuestEntry canEnter={supportedScreen && !user} />;
  if (pathname === "/play" && user) return <Navigate to="/" replace />;
  if (!supportedScreen) return <SupportedScreenMessage />;
  if (!user) return <GuestEntry canEnter={supportedScreen} />;
  return <div key={user.id} className="contents"><Suspense fallback={<Loading />}><Index /></Suspense></div>;
}

function Login() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/" replace />;
  return <>
    <Link to="/" className="absolute left-6 top-6 z-10 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">{t("auth.home")}</Link>
    <Auth initialMode={params.get("mode") === "signup" ? "signup" : "signin"} />
  </>;
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <BrowserRouter><LanguageProvider><TooltipProvider>
      <Sonner />
        <Routes>
          <Route element={<PublicEntry />}>
            <Route path="/" element={<></>} />
            <Route path="/play" element={<></>} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/auth/native" element={<NativeAuth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
    </TooltipProvider></LanguageProvider></BrowserRouter>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
