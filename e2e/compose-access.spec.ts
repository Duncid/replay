import { test, expect, testAccount } from './fixtures';

for (const isAdmin of [false, true]) {
  test(`remembered Compose mode requires a confirmed admin role (admin=${isAdmin})`, async ({ page }) => {
    await page.addInitScript(account => {
      localStorage.setItem(`replay-active-mode:account:${account}`, JSON.stringify('play'));
    }, testAccount);
    let compositionRequests = 0;
    await page.route('**/rest/v1/compositions?**', route => {
      compositionRequests++;
      return route.fulfill({ json: [] });
    });
    let releaseRole: () => void = () => {};
    const pendingRole = new Promise<void>(resolve => { releaseRole = resolve; });
    await page.route('**/rest/v1/user_roles?**', async route => {
      await pendingRole;
      return route.fulfill({ json: isAdmin ? [{ role: 'admin' }] : [] });
    });
    await page.goto('/');
    const compose = page.getByRole('tab', { name: 'Compose', exact: true });
    const tunes = page.getByRole('tab', { name: 'Tunes', exact: true });
    const toolbar = page.locator('.keyboard-toolbar');
    await expect(toolbar.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(compose).toHaveCount(0);
    expect(compositionRequests).toBe(0);
    const roleResponse = page.waitForResponse('**/rest/v1/user_roles?**');
    releaseRole();
    await roleResponse;
    if (isAdmin) {
      await expect(compose).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByRole('tabpanel', { name: 'Compose', exact: true })).toBeVisible();
      await expect.poll(() => compositionRequests).toBe(1);
      await tunes.click();
      await compose.click();
      await expect(compose).toHaveAttribute('aria-selected', 'true');
    } else {
      await expect(page.getByRole('tablist')).toHaveCount(0);
      await expect(page.getByRole('tabpanel')).toBeVisible();
      await expect(compose).toHaveCount(0);
      await expect(page.getByRole('tabpanel', { name: 'Compose', exact: true })).toHaveCount(0);
      expect(compositionRequests).toBe(0);
    }
    const menu = await toolbar.getByRole('button', { name: 'Menu', exact: true }).boundingBox();
    const settings = await toolbar.getByRole('button', { name: 'Keyboard settings', exact: true }).boundingBox();
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(settings!.x);
    expect(menu!.y + menu!.height / 2).toBe(settings!.y + settings!.height / 2);
  });
}
