import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { nativeAuthCallback, nativeAuthRequest } from '@/utils/nativeAuthCallback';
import Auth from './Auth';

/** Hosted on Noodlyn's HTTPS site so Lovable's OAuth broker remains available. */
export default function NativeAuth() {
  const { user, loading, signOut } = useAuth();
  const [error, setError] = useState('');
  const request = nativeAuthRequest(window.location.search);
  if (!request) return <main className="p-8">This sign-in link is invalid. Open Noodlyn on your iPad and try again.</main>;
  if (loading) return <main className="p-8">Loading sign-in…</main>;
  if (!user) return <Auth redirectTo={`${window.location.origin}${window.location.pathname}${window.location.search}`} />;

  const continueToApp = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) { setError('Your session expired. Sign in again.'); return; }
    window.location.replace(nativeAuthCallback(request, {
      access_token: data.session.access_token, refresh_token: data.session.refresh_token,
    }));
  };
  return <main className="min-h-dvh flex items-center justify-center bg-background text-foreground p-6">
    <div className="w-full max-w-sm space-y-6 text-center">
      <h1 className="text-3xl font-bold">Continue to Noodlyn</h1>
      <p>Signed in as {user.email}</p>
      {error && <p role="alert">{error}</p>}
      <Button className="w-full" onClick={continueToApp}>Continue to the iPad app</Button>
      <Button variant="outline" className="w-full" onClick={() => { void signOut().catch(e => setError(String(e))); }}>Use another account</Button>
    </div>
  </main>;
}
