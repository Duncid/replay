import { test, expect, type Page } from '@playwright/test';
import { sessionFixture, sessionKey } from './fixtures';
import { nativeAuthRequest, nativeAuthCallback } from '../src/utils/nativeAuthCallback';
import { accountStorageKey, setStorageAccount } from '../src/utils/accountStorage';
import { demoWav } from './fixtures/demoAudio';

const accountA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const accountB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const profileA = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const profileB = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const state = '12345678-1234-1234-1234-123456789abc';

async function mockAccounts(page: Page) {
  let current = sessionFixture(accountA, 'a@example.test');
  const profileRequests: string[] = [];
  await page.route('**/*.supabase.co/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/token')) {
      const email = route.request().postDataJSON().email ?? current.user.email;
      current = sessionFixture(email === 'b@example.test' ? accountB : accountA, email);
      return route.fulfill({ json: current });
    }
    if (url.pathname.endsWith('/user')) return route.fulfill({ json: current.user });
    if (url.pathname.endsWith('/logout')) return route.fulfill({ status: 204 });
    if (url.pathname.includes('/rest/')) {
      if (url.pathname.endsWith('/local_users')) {
        profileRequests.push(url.searchParams.get('auth_user_id') ?? '');
        return route.fulfill({ json: [{ id: current.user.id === accountA ? profileA : profileB, name: current.user.email }] });
      }
      if (url.pathname.endsWith('/user_roles')) return route.fulfill({ json: current.user.id === accountA ? [{ role: 'admin' }] : [] });
      if (url.pathname.endsWith('/tune_assets')) return route.fulfill({ json: [{ tune_key: 'intro', is_global: true, note_sequence: { notes: [{ pitch: 60, startTime: 0, endTime: 1 }], totalTime: 1 } }] });
      return route.fulfill({ json: [] });
    }
    return route.abort();
  });
  return profileRequests;
}
async function signIn(page: Page, email: string) {
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Practice: Intro', exact: true })).toBeVisible();
}

test('native handoff rejects unknown clients and malformed state', () => {
  expect(nativeAuthRequest('?client=evil&state=' + state)).toBeNull();
  expect(nativeAuthRequest('?client=native&state=short')).toBeNull();
  expect(nativeAuthCallback(nativeAuthRequest('?client=native&state=' + state)!, { access_token: 'access', refresh_token: 'refresh' }))
    .toBe('com.playbk.learn://auth/callback#access_token=access&refresh_token=refresh&state=' + state);
  expect(nativeAuthRequest('?client=capacitor&state=' + state)?.callback).toBe('com.playbk.app://auth/callback');
});

test('draft keys are isolated by account while instrument preferences remain shared', () => {
  setStorageAccount(accountA); const first = accountStorageKey('replay-play-history');
  setStorageAccount(accountB); expect(accountStorageKey('replay-play-history')).not.toBe(first);
  expect(accountStorageKey('quest-editor-data')).toContain(accountB);
  expect(accountStorageKey('replay-instrument')).toBe('replay-instrument');
  setStorageAccount(null); expect(accountStorageKey('replay-play-history')).not.toBe(first);
});

test('sign-in, reload and account switching isolate profiles and admin controls', async ({ page }) => {
  const requests = await mockAccounts(page);
  await page.addInitScript(() => localStorage.setItem('replay-current-user-id', 'legacy-unowned-profile'));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your rhythm.' })).toBeVisible();
  expect(requests).toEqual([]);
  await signIn(page, 'a@example.test');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Practice: Intro', exact: true })).toBeVisible();
  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('button', { name: 'Practice: Intro', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), 'replay-current-user-id:account:' + accountA)).toBe(profileA);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Quest', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Find your rhythm.' })).toBeVisible();
  await signIn(page, 'b@example.test');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), 'replay-current-user-id:account:' + accountB)).toBe(profileB);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('menuitem', { name: 'Quest', exact: true })).toHaveCount(0);
  expect(requests).toContain('eq.' + accountA); expect(requests).toContain('eq.' + accountB);
});

for (const provider of ['google', 'apple'] as const) {
  test(`hosted native sign-in preserves its return context through ${provider} OAuth`, async ({ page, baseURL }) => {
    await mockAccounts(page);
    let redirect = '';
    await page.route('**/~oauth/initiate?**', route => { redirect = route.request().url(); return route.fulfill({ body: 'OAuth broker' }); });
    await page.goto('/auth/native?client=native&state=' + state);
    await page.getByRole('button', { name: `Continue with ${provider === 'apple' ? 'Apple' : 'Google'}`, exact: true }).click();
    await expect.poll(() => redirect).not.toBe('');
    const request = new URL(redirect);
    expect(request.searchParams.get('provider')).toBe(provider);
    const returnPath = request.searchParams.get('redirect_uri');
    expect(returnPath).toBeTruthy();
    if (!returnPath) throw new Error('Missing OAuth return URL');
    const returnURL = new URL(returnPath);
    expect(returnURL.origin).toBe(new URL(baseURL!).origin);
    expect(returnURL.pathname).toBe('/auth/native');
    expect(returnURL.searchParams.get('client')).toBe('native');
    expect(returnURL.searchParams.get('state')).toBe(state);
  });
}

test('Apple web sign-in returns to the public app origin', async ({ page, baseURL }) => {
  await mockAccounts(page);
  let redirect = '';
  await page.route('**/~oauth/initiate?**', route => { redirect = route.request().url(); return route.fulfill({ body: 'OAuth broker' }); });
  await page.goto('/');
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.getByRole('button', { name: 'Continue with Apple', exact: true }).click();
  await expect.poll(() => redirect).not.toBe('');
  const request = new URL(redirect);
  expect(request.searchParams.get('provider')).toBe('apple');
  expect(request.searchParams.get('redirect_uri')).toBe(new URL(baseURL!).origin);
});

test('hosted handoff asks the user to confirm the account and rejects arbitrary return URLs', async ({ page }) => {
  await mockAccounts(page);
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: sessionKey, session: sessionFixture(accountA, 'a@example.test') });
  await page.goto('/auth/native?client=native&state=' + state);
  await expect(page.getByText('Signed in as a@example.test')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue to the iPad app' })).toBeVisible();
  await page.goto('/auth/native?client=https://evil.example&state=' + state);
  await expect(page.getByText('This sign-in link is invalid.', { exact: false })).toBeVisible();
});

test('packaged app uses the native browser bridge and secure session storage', async ({ page }) => {
  const profileRequests = await mockAccounts(page);
  await page.route('**/tonejs-instruments/samples/**', route => route.fulfill({ body: demoWav(), contentType: 'audio/wav' }));
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.addInitScript(session => {
    const saved: Record<string, string> = {};
    window['nativeAuthCalls'] = [];
    window['cancelNativeSignIn'] = true;
    window['webkit'] = { messageHandlers: { bridge: { postMessage: () => {} } } };
    window['Capacitor'] = {
      getPlatform: () => 'ios', isNativePlatform: () => true,
      PluginHeaders: [{ name: 'ReplayAuth', methods: ['signIn', 'getSession', 'saveSession', 'removeSession'].map(name => ({ name, rtype: 'promise' })) }],
      nativePromise: async (_plugin: string, method: string, args: { key: string; value?: string }) => {
        window['nativeAuthCalls'].push(method);
        if (method === 'getSession') return { value: saved[args.key] ?? null };
        if (method === 'saveSession') saved[args.key] = args.value ?? "";
        if (method === 'removeSession') delete saved[args.key];
        if (method === 'signIn') {
          if (window['cancelNativeSignIn']) { window['cancelNativeSignIn'] = false; throw new Error('Sign-in cancelled'); }
          return { accessToken: session.access_token, refreshToken: session.refresh_token };
        }
        return {};
      },
    };
  }, sessionFixture(accountA, 'a@example.test'));
  await page.goto('/');
  await expect(page.locator('.noodlyn-landing[data-preview-state="ready"]')).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('.landing-ipad')).toBeVisible();
  expect(await page.evaluate(() => window['nativeAuthCalls'])).not.toContain('signIn');
  await page.getByRole('link', { name: 'Start playing', exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByRole('button', { name: 'Practice: Intro', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Locked: St Louis Blues', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Practice: Intro', exact: true }).click();
  await expect(page.locator('.note-highway[data-render-ready="true"]')).toBeVisible();
  await expect(page.locator('.piano-surface button[data-note="C4"]')).toBeEnabled();
  expect(profileRequests).toEqual([]);
  await page.getByRole('link', { name: 'Back to home', exact: true }).click();
  await expect(page.locator('.guest-entry')).toHaveAttribute('data-entry-phase', 'idle');
  await page.goto('/play'); // Direct native guest entry and reload stay signed out.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Practice: Intro', exact: true })).toBeEnabled();
  await page.getByRole('link', { name: 'Sign up', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in to Noodlyn', exact: true }).click();
  await expect(page.getByText('Sign-in cancelled', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Noodlyn', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Start playing', exact: true })).toBeVisible();
  expect(profileRequests).toEqual([]);
  await page.getByRole('link', { name: 'Sign in', exact: true }).click();
  await page.getByRole('button', { name: 'Sign in to Noodlyn', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Practice: Intro', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window['nativeAuthCalls'])).toContain('saveSession');
  expect(await page.evaluate(key => localStorage.getItem(key), sessionKey)).toBeNull();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Start playing', exact: true })).toBeVisible();
  await expect(page.locator('[data-guest-workspace]')).toHaveCount(0);
  expect(await page.evaluate(() => window['nativeAuthCalls'])).toContain('removeSession');
});

test('expired refresh credentials return to sign-in without reading another profile', async ({ page }) => {
  const profileRequests = await mockAccounts(page);
  const expired = sessionFixture(accountA, 'a@example.test');
  expired.expires_at = Math.floor(Date.now() / 1000) - 3600;
  await page.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), { key: sessionKey, session: expired });
  await page.route('**/auth/v1/token?**', route => route.fulfill({ status: 400, json: { code: 'refresh_token_not_found', msg: 'Refresh token expired' } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find your rhythm.' })).toBeVisible();
  expect(profileRequests).toEqual([]);
});

test('password recovery keeps the native return path on the trusted website', async ({ page }) => {
  await mockAccounts(page);
  let recoveryURL = '';
  await page.route('**/auth/v1/recover?**', route => { recoveryURL = route.request().url(); return route.fulfill({ json: {} }); });
  await page.goto('/auth/native?client=capacitor&state=' + state);
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill('a@example.test');
  await page.getByRole('button', { name: 'Send reset link', exact: true }).click();
  await expect.poll(() => recoveryURL).not.toBe('');
  const returnURL = new URL(new URL(recoveryURL).searchParams.get('redirect_to')!);
  expect(returnURL.pathname).toBe('/reset-password');
  expect(returnURL.searchParams.get('next')).toBe('/auth/native?client=capacitor&state=' + state);
});

test('practice waits until the remembered profile ownership is checked', async ({ page }) => {
  await mockAccounts(page);
  await page.addInitScript(({ key, session, account, profile }) => {
    localStorage.setItem(key, JSON.stringify(session));
    localStorage.setItem('replay-current-user-id:account:' + account, profile);
  }, { key: sessionKey, session: sessionFixture(accountA, 'a@example.test'), account: accountA, profile: profileA });
  let release: () => void = () => {};
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/rest/v1/local_users?**', async route => { await pending; await route.fallback(); });
  await page.goto('/');
  await expect(page.getByText('Loading tunes…')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Practice: Intro', exact: true })).toHaveCount(0);
  release();
  await expect(page.getByRole('button', { name: 'Practice: Intro', exact: true })).toBeVisible();
});
