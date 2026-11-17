import { expect, test } from '@playwright/test';

import { loginAsAdmin } from './support';

test('two browsers stay signed in together, and closing the others logs the second one out', async ({
  browser,
}) => {
  const first = await browser.newContext();
  const second = await browser.newContext();
  const a = await first.newPage();
  const b = await second.newPage();

  // Before ADR-0024 the second login replaced the first one's session.
  await loginAsAdmin(a);
  await loginAsAdmin(b);

  // A full page load restores the session from the refresh cookie, so reaching the screen
  // proves the first browser survived the second login.
  await a.goto('/sesiones');
  await expect(a.getByRole('heading', { name: 'Sesiones activas' })).toBeVisible();
  await expect(a.getByText('Este navegador')).toHaveCount(1);
  const sessions = a.getByRole('list', { name: 'Sesiones activas' }).getByRole('listitem');
  await expect.poll(() => sessions.count()).toBeGreaterThanOrEqual(2);

  await a.getByRole('button', { name: 'Cerrar las demás' }).click();
  await a.getByRole('dialog').getByRole('button', { name: 'Cerrar las demás' }).click();
  await expect(sessions).toHaveCount(1);
  await expect(a.getByText('Este navegador')).toBeVisible();

  // The second browser's refresh cookie was revoked: a reload cannot restore its session.
  await b.reload();
  await expect(b).toHaveURL(/\/login/);

  // The first one is untouched.
  await a.reload();
  await expect(a).toHaveURL(/\/sesiones/);

  await first.close();
  await second.close();
});
