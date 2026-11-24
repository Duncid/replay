import { test as base, expect } from '@playwright/test';
export { expect };
export const testAccount = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const sessionKey = 'sb-mmlizntmpbriyumsunsh-auth-token';
export function sessionFixture(id = testAccount, email = 'test@example.test') {
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.test`,
    refresh_token: 'fixture-refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id, email, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
}
export function accountRows(url: string) {
  if (url.includes('/user_roles')) return [{ role: 'admin' }];
  if (url.includes('/local_users')) return [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Test player', auth_user_id: testAccount }];
  return undefined;
}
export const test = base.extend({
  page: async ({ page }, provide) => {
    const session = sessionFixture();
    await page.addInitScript(({ session, key }) => localStorage.setItem(key, JSON.stringify(session)), { session, key: sessionKey });
    await page.route('**/*.supabase.co/**', route => {
      const url = route.request().url();
      if (url.includes('/auth/v1/user')) return route.fulfill({ json: session.user });
      if (url.includes('/rest/v1/')) return route.fulfill({ json: accountRows(url) ?? [] });
      return route.abort();
    });
    await provide(page);
  },
});
