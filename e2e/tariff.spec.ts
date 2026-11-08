import { expect, test } from '@playwright/test';

import { loginAsAdmin } from './support';

/**
 * The tariff is seeded by the V16 migration (base 2000, 51-65 band x1.80, STANDARD x1.00, max
 * issue age 85), so the quote is deterministic against a fresh database.
 */
test.describe('Membership fee tariff', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto('/tarifario');
    await expect(page.getByRole('heading', { name: 'Tarifario de cuotas' })).toBeVisible();
  });

  test('quotes an insurable applicant from the seeded tariff', async ({ page }) => {
    await page.getByRole('spinbutton', { name: 'Edad', exact: true }).fill('55');
    await page.getByRole('button', { name: 'Cotizar' }).click();
    // 2000 x 1.80 x 1.00 = 3600, rendered as es-AR currency without decimals.
    await expect(page.getByText(/\$\s?3\.600/)).toBeVisible();
    await expect(page.getByText(/franja 51-65/)).toBeVisible();
  });

  test('reports an applicant above the max issue age as not insurable', async ({ page }) => {
    await page.getByRole('spinbutton', { name: 'Edad', exact: true }).fill('90');
    await page.getByRole('button', { name: 'Cotizar' }).click();
    await expect(page.getByText('La edad supera el máximo de ingreso permitido.')).toBeVisible();
  });
});
