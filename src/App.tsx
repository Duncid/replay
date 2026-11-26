import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import { lazy, Suspense } from "react";
import Landing from "./pages/Landing";
import NativeAuth from "./pages/NativeAuth";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import type { ReactNode } from "react";
import { isNativeApp } from "./lib/nativeAuth";

const Index = lazy(() => import("./pages/Index"));

const Loading = () => <div className="h-dvh flex items-center justify-center bg-background text-foreground">Loading music...</div>;

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return isNativeApp() ? <Auth /> : <Landing />;
  return <div key={user.id} className="contents">{children}</div>;
}

function Login() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (user) return <Navigate to="/" replace />;
  return <>
    {!isNativeApp() && <Link to="/" className="absolute left-6 top-6 z-10 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">Back to Noodlyn</Link>}
    <Auth />
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
          <Route path="/" element={<RequireAuth><Suspense fallback={<Loading />}><Index /></Suspense></RequireAuth>} />
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
