import { expect, type Page } from '@playwright/test';

/** Bootstrap admin created by the backend `docker` profile (see e2e/docker-compose.e2e.yml). */
export const ADMIN = { email: 'admin@funeraria.local', password: 'Admin123!' };

export async function login(page: Page, email = ADMIN.email, password = ADMIN.password) {
  await page.goto('/login');
  await page.locator('input[formcontrolname="email"]').fill(email);
  await page.locator('input[formcontrolname="password"]').fill(password);
  await page.getByRole('button', { name: 'Ingresar' }).click();
}

export async function loginAsAdmin(page: Page) {
  await login(page);
  await expect(page).toHaveURL(/\/dashboard/);
}
