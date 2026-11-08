import { expect, test } from '@playwright/test';

import { ADMIN, login, loginAsAdmin } from './support';

test.describe('Authentication', () => {
  test('an admin logs in and lands on the dashboard with live KPIs', async ({ page }) => {
    await loginAsAdmin(page);
    await expect(page.getByRole('heading', { name: 'Indicadores' })).toBeVisible();
    // KPI tiles render real numbers once GET /api/v1/metrics/dashboard answers.
    await expect(page.getByText('Afiliados activos')).toBeVisible();
  });

  test('wrong credentials keep the user on the login page with an error', async ({ page }) => {
    await login(page, ADMIN.email, 'definitely-wrong-password');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('a protected route redirects an anonymous visitor to login', async ({ page }) => {
    await page.goto('/afiliados');
    await expect(page).toHaveURL(/\/login/);
  });

  test('logout returns to the login page', async ({ page }) => {
    await loginAsAdmin(page);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login/);
  });

  test('the login request carries an Idempotency-Key', async ({ page }) => {
    const loginRequest = page.waitForRequest(
      (r) => r.url().endsWith('/api/v1/users/login') && r.method() === 'POST',
    );
    await login(page);
    const headers = (await loginRequest).headers();
    expect(headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  });
});
