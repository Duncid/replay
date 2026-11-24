import { Capacitor, registerPlugin } from '@capacitor/core';
import { supabase } from '@/integrations/supabase/client';

const nativeAuth = registerPlugin<{
  signIn(): Promise<{ accessToken: string; refreshToken: string }>;
}>('ReplayAuth');

export const isNativeApp = () => Capacitor.isNativePlatform();

export async function signInNative() {
  const tokens = await nativeAuth.signIn();
  const { error } = await supabase.auth.setSession({
    access_token: tokens.accessToken, refresh_token: tokens.refreshToken,
  });
  if (error) throw error;
}
