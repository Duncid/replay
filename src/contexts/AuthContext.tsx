import { supabase } from '@/integrations/supabase/client';
import { setStorageAccount } from '@/utils/accountStorage';
import { useQueryClient } from '@tanstack/react-query';
import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

interface AuthState {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthState>({ user: null, session: null, isAdmin: false, loading: true, signOut: async () => {} });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const previousAccount = useRef<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    // INITIAL_SESSION is delivered by this subscription too. A second getSession
    // request can race sign-out and restore a stale account in the UI.
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      const account = next?.user.id ?? null;
      if (previousAccount.current !== account) {
        queryClient.clear();
        setAdminUserId(null);
      }
      previousAccount.current = account;
      setStorageAccount(account);
      setSession(next);
      setLoading(false);
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void supabase.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle()
      .then(({ data }) => { if (active) setAdminUserId(data ? userId : null); });
    return () => { active = false; };
  }, [userId]);

  const signOut = async () => {
    // Local scope signs out this app without also invalidating other devices.
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
  };
  return <AuthContext.Provider value={{ user: session?.user ?? null, session, isAdmin: !!userId && adminUserId === userId, loading, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
