import { type Page } from '@playwright/test';
import { test, expect, testAccount } from './fixtures';

const firstId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const secondId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const selectedKey = 'replay-current-user-id:account:' + testAccount;

async function mockPlayers(page: Page) {
  let players = [
    { id: firstId, name: 'Alex', auth_user_id: testAccount },
    { id: secondId, name: 'Sam', auth_user_id: testAccount },
  ];
  const writes: { method: string; id: string | null; owner: string | null; body: unknown }[] = [];
  const failures = { save: false, delete: false, create: false };
  await page.route('**/rest/v1/local_users?**', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    if (method === 'GET') return route.fulfill({ json: players });
    const id = url.searchParams.get('id');
    writes.push({ method, id, owner: url.searchParams.get('auth_user_id'), body: request.postDataJSON() });
    if ((method === 'PATCH' && failures.save) || (method === 'DELETE' && failures.delete) || (method === 'POST' && failures.create)) {
      return route.fulfill({ status: 403, json: { message: 'Permission denied' } });
    }
    if (method === 'POST') {
      const created = { ...request.postDataJSON(), id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' };
      players.push(created);
      return route.fulfill({ json: created });
    }
    if (method === 'PATCH') {
      players = players.map(player => 'eq.' + player.id === id ? { ...player, ...request.postDataJSON() } : player);
      return route.fulfill({ json: players.find(player => 'eq.' + player.id === id) });
    }
    if (method === 'DELETE') {
      const removed = players.find(player => 'eq.' + player.id === id)!;
      players = players.filter(player => player.id !== removed.id);
      return route.fulfill({ json: { id: removed.id } });
    }
    return route.abort();
  });
  await page.goto('/');
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), selectedKey)).toBe(firstId);
  return { writes, failures };
}

async function edit(page: Page, name: string) {
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByText('Player', { exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: `Edit ${name}`, exact: true }).click();
  return page.getByRole('dialog', { name: 'Edit player', exact: true });
}

test('rename is explicit, persisted, and does not select the edited player', async ({ page }) => {
  const { writes } = await mockPlayers(page);
  const dialog = await edit(page, 'Sam');
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Close', exact: true }).first()).toBeVisible();
  await dialog.getByLabel('Name', { exact: true }).fill('Samuel');
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(writes).toEqual([]);
  await edit(page, 'Sam');
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Sam');
  await dialog.getByLabel('Name', { exact: true }).fill('  ');
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await dialog.getByLabel('Name', { exact: true }).fill(' Samuel ');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Samuel', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitemradio', { name: 'Alex', exact: true })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('menuitem', { name: 'New player', exact: true })).toHaveClass(/text-muted-foreground/);
  expect(writes).toEqual([{ method: 'PATCH', id: 'eq.' + secondId, owner: 'eq.' + testAccount, body: expect.objectContaining({ name: 'Samuel', avatar_seed: secondId, avatar_color: expect.any(String) }) }]);
});

test('delete requires confirmation and moves selection to a remaining player, then clears it', async ({ page }) => {
  const { writes } = await mockPlayers(page);
  const dialog = await edit(page, 'Alex');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmation = page.getByRole('alertdialog', { name: 'Delete player?' });
  await expect(confirmation).toContainText('Are you sure you want to delete Alex?');
  await confirmation.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(writes).toEqual([]);
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), selectedKey)).toBe(secondId);
  await edit(page, 'Sam');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), selectedKey)).toBeNull();
  await page.reload();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: /Alex|Sam/ })).toHaveCount(0);
  await page.getByRole('menuitem', { name: 'New player', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'New player' })).toBeVisible();
  expect(writes.map(write => [write.method, write.owner])).toEqual([
    ['DELETE', 'eq.' + testAccount], ['DELETE', 'eq.' + testAccount],
  ]);
});

test('failed writes keep the modal open and can be retried', async ({ page }) => {
  const { failures } = await mockPlayers(page);
  const dialog = await edit(page, 'Sam');
  failures.save = true;
  await dialog.getByLabel('Name', { exact: true }).fill('Samuel');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not save');
  await expect(dialog.getByLabel('Name', { exact: true })).toHaveValue('Samuel');
  failures.delete = true;
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  const confirmation = page.getByRole('alertdialog');
  await expect(confirmation).toContainText('delete Sam?');
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(confirmation.getByRole('alert')).toContainText('Could not delete');
  failures.delete = false;
  await confirmation.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), selectedKey)).toBe(firstId);
});

test('edit action is keyboard accessible without selecting the player', async ({ page }) => {
  await mockPlayers(page);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const editSam = page.getByRole('menuitem', { name: 'Edit Sam', exact: true });
  if (await page.evaluate(() => matchMedia('(hover: hover)').matches)) {
    await expect(editSam).toHaveCSS('opacity', '0');
    await page.getByRole('menuitemradio', { name: 'Sam', exact: true }).hover();
    await expect(editSam).toHaveCSS('opacity', '1');
    await page.getByText('Player', { exact: true }).hover();
    await expect(editSam).toHaveCSS('opacity', '0');
  } else {
    await expect(editSam).toHaveCSS('opacity', '1');
  }
  await page.getByRole('menuitemradio', { name: 'Sam', exact: true }).focus();
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('menuitem', { name: 'Edit Sam', exact: true })).toBeFocused();
  await expect(editSam).toHaveCSS('opacity', '1');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Edit player' })).toBeVisible();
  await expect(page.getByLabel('Name', { exact: true })).toBeFocused();
  expect(await page.evaluate(key => localStorage.getItem(key), selectedKey)).toBe(firstId);
});

test('character and color change independently, omit F, and persist after reload', async ({ page }, testInfo) => {
  const { writes } = await mockPlayers(page);
  const dialog = await edit(page, 'Sam');
  const preview = dialog.getByRole('combobox', { name: 'Character', exact: true }).locator('img');
  await expect(dialog.getByRole('combobox')).toHaveCount(2);
  await expect(dialog.getByRole('img', { name: 'Selected avatar', exact: true })).toHaveCount(0);
  await dialog.getByRole('combobox', { name: 'Color', exact: true }).click();
  await expect(page.getByRole('option')).toHaveCount(6);
  await expect(page.getByRole('option', { name: 'F', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  const original = await preview.getAttribute('src');
  await dialog.getByRole('combobox', { name: 'Character', exact: true }).click();
  await page.getByRole('option', { name: 'Character 2', exact: true }).click();
  const changedCharacter = await preview.getAttribute('src');
  expect(changedCharacter).not.toBe(original);
  await dialog.getByRole('combobox', { name: 'Color', exact: true }).click();
  await page.getByRole('option', { name: 'B', exact: true }).click();
  await expect(dialog.getByRole('combobox', { name: 'Character', exact: true })).toContainText('Character 2');
  await dialog.screenshot({ path: testInfo.outputPath('avatar-picker.png') });
  const chosen = await preview.getAttribute('src');
  expect(decodeURIComponent(chosen!)).toContain('#a66bff');
  await expect(dialog.getByRole('combobox', { name: 'Color', exact: true })).toContainText('B');
  await dialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  expect(writes[0].body).toMatchObject({ name: 'Sam', avatar_color: 'B', avatar_seed: expect.any(String) });
  await page.reload();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await expect(page.getByRole('menuitemradio', { name: 'Sam', exact: true }).locator('img')).toHaveAttribute('src', chosen!);
  await page.getByRole('menuitem', { name: 'Edit Sam', exact: true }).click();
  await expect(preview).toHaveAttribute('src', chosen!);
  await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toHaveCount(0);
});

test('cancel discards avatar changes', async ({ page }) => {
  const { writes } = await mockPlayers(page);
  const dialog = await edit(page, 'Alex');
  const preview = dialog.getByRole('combobox', { name: 'Character', exact: true }).locator('img');
  const original = await preview.getAttribute('src');
  await dialog.getByRole('combobox', { name: 'Character', exact: true }).click();
  await page.getByRole('option', { name: 'Character 2', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Color', exact: true }).click();
  await page.getByRole('option', { name: 'E', exact: true }).click();
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await edit(page, 'Alex');
  await expect(preview).toHaveAttribute('src', original!);
  expect(writes).toEqual([]);
});

test('new player saves the selected avatar and retains choices after a failed request', async ({ page }) => {
  const { writes, failures } = await mockPlayers(page);
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  await page.getByRole('menuitem', { name: 'New player', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New player', exact: true });
  await dialog.getByLabel('Name', { exact: true }).fill('Jo');
  await dialog.getByRole('combobox', { name: 'Character', exact: true }).click();
  await page.getByRole('option', { name: 'Character 3', exact: true }).click();
  await dialog.getByRole('combobox', { name: 'Color', exact: true }).click();
  await page.getByRole('option', { name: 'C', exact: true }).click();
  const chosen = await dialog.getByRole('combobox', { name: 'Character', exact: true }).locator('img').getAttribute('src');
  failures.create = true;
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Could not create');
  await expect(dialog.getByRole('combobox', { name: 'Character', exact: true }).locator('img')).toHaveAttribute('src', chosen!);
  failures.create = false;
  await dialog.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'Menu', exact: true }).click();
  const player = page.getByRole('menuitemradio', { name: 'Jo', exact: true });
  await expect(player).toHaveAttribute('aria-checked', 'true');
  await expect(player.locator('img')).toHaveAttribute('src', chosen!);
  expect(writes[1].body).toMatchObject({ name: 'Jo', auth_user_id: testAccount, avatar_color: 'C', avatar_seed: expect.any(String) });
});
