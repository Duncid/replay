const callbacks = {
  capacitor: 'com.playbk.app://auth/callback',
  native: 'com.playbk.learn://auth/callback',
} as const;

/** Only our two apps can receive sessions; never accept a caller-supplied return URL. */
export function nativeAuthRequest(search: string) {
  const params = new URLSearchParams(search);
  const client = params.get('client');
  const state = params.get('state');
  if ((client !== 'capacitor' && client !== 'native') || !state ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(state)) return null;
  return { callback: callbacks[client], state };
}

export function nativeAuthCallback(request: NonNullable<ReturnType<typeof nativeAuthRequest>>, tokens: { access_token: string; refresh_token: string }) {
  return `${request.callback}#${new URLSearchParams({ ...tokens, state: request.state })}`;
}
