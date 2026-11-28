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
    const beta = page.getByRole('group', { name: 'Beta', exact: true });
    const compose = beta.getByRole('menuitem', { name: 'Compose', exact: true });
    const back = page.getByRole('button', { name: 'Back to tunes', exact: true });
    const toolbar = page.locator('.keyboard-toolbar');
    await expect(toolbar.getByRole('button', { name: 'Menu', exact: true })).toBeVisible();
    await expect(page.getByRole('tablist')).toHaveCount(0);
    await expect(compose).toHaveCount(0);
    expect(compositionRequests).toBe(0);
    const roleResponse = page.waitForResponse('**/rest/v1/user_roles?**');
    releaseRole();
    await roleResponse;
    if (isAdmin) {
      await expect(back).toBeVisible();
      await expect(page.getByRole('tab')).toHaveCount(0);
      await expect(page.getByRole('tabpanel', { name: 'Compose', exact: true })).toBeVisible();
      await expect.poll(() => compositionRequests).toBe(1);
      await back.click();
      await expect(back).toHaveCount(0);
      await toolbar.getByRole('button', { name: 'Menu', exact: true }).click();
      await compose.click();
      await expect(back).toBeVisible();
    } else {
      await expect(page.getByRole('tablist')).toHaveCount(0);
      await expect(page.getByRole('tabpanel')).toBeVisible();
      await expect(compose).toHaveCount(0);
      await expect(back).toHaveCount(0);
      await toolbar.getByRole('button', { name: 'Menu', exact: true }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      await expect(beta).toHaveCount(0);
      await expect(page.getByRole('menuitem', { name: 'Compose', exact: true })).toHaveCount(0);
      await page.keyboard.press('Escape');
      expect(compositionRequests).toBe(0);
    }
    const menu = await toolbar.getByRole('button', { name: 'Menu', exact: true }).boundingBox();
    const settings = await toolbar.getByRole('button', { name: 'Keyboard settings', exact: true }).boundingBox();
    expect(menu!.x + menu!.width).toBeLessThanOrEqual(settings!.x);
    expect(menu!.y + menu!.height / 2).toBe(settings!.y + settings!.height / 2);
  });
}
