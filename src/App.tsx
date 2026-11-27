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
import { isNativeApp } from "./lib/nativeAuth";

const Index = lazy(() => import("./pages/Index"));

const Loading = () => <div className="h-dvh flex items-center justify-center bg-background text-foreground">Loading music...</div>;

function PublicEntry() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  if (loading) return <Loading />;
  if (pathname === "/play" && (user || isNativeApp())) return <Navigate to="/" replace />;
  if (!user) return isNativeApp() ? <Auth /> : <GuestEntry />;
  return <div key={user.id} className="contents"><Suspense fallback={<Loading />}><Index /></Suspense></div>;
}

function Login() {
  const [params] = useSearchParams();
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/" replace />;
  return <>
    {!isNativeApp() && <Link to="/" className="absolute left-6 top-6 z-10 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Back to Noodlyn</Link>}
    <Auth initialMode={params.get("mode") === "signup" ? "signup" : "signin"} />
  </>;
}

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
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
      </BrowserRouter>
    </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
