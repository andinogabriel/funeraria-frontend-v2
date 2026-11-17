import { expect, test } from '@playwright/test';

import { loginAsAdmin } from './support';

/** Regression guard for the nginx add_header inheritance bug, end to end through the browser. */
test('the SPA document is served with the security headers', async ({ page }) => {
  const response = await page.goto('/login');
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
});

test('the CSP is strict: per-request nonce for styles, no unsafe-inline, Trusted Types', async ({
  page,
}) => {
  const first = (await page.goto('/login'))!.headers()['content-security-policy'];
  const nonce = /'nonce-([0-9a-f]+)'/.exec(first)?.[1];
  expect(nonce).toMatch(/^[0-9a-f]{32}$/);
  expect(first).not.toContain('unsafe-inline');
  expect(first).toContain("require-trusted-types-for 'script'");
  // The inline tags in the document carry the same value as the header.
  expect(
    await page
      .locator('style[nonce]')
      .first()
      .evaluate((el) => (el as HTMLElement).nonce),
  ).toBe(nonce);

  const second = (await page.reload())!.headers()['content-security-policy'];
  expect(second).not.toContain(nonce!);
});

test('the signed-in app runs with no CSP or Trusted Types violation', async ({ page }) => {
  const violations: string[] = [];
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      (window as unknown as { cspViolations: string[] }).cspViolations ??= [];
      (window as unknown as { cspViolations: string[] }).cspViolations.push(
        `${event.violatedDirective} ${event.blockedURI}`,
      );
    });
  });
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      /Content Security Policy|TrustedHTML|TrustedScript/.test(message.text())
    ) {
      violations.push(message.text());
    }
  });

  await loginAsAdmin(page);
  const paths = ['/dashboard', '/afiliados', '/servicios', '/planes', '/items', '/ingresos'];
  for (const path of [...paths, '/titulares', '/tarifario', '/auditoria']) {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    // Open the command palette too: it is a CDK overlay with its own injected styles.
    if (path === '/dashboard') {
      await page.keyboard.press('Control+k');
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.keyboard.press('Escape');
    }
    violations.push(
      ...(await page.evaluate(
        () => (window as unknown as { cspViolations?: string[] }).cspViolations ?? [],
      )),
    );
  }
  expect(violations).toEqual([]);
});

test('actuator is not exposed through the frontend origin', async ({ request }) => {
  const res = await request.get('/actuator/prometheus');
  // The SPA fallback answers with index.html: no metrics leak through nginx.
  expect(await res.text()).not.toContain('jvm_memory_used_bytes');
});
