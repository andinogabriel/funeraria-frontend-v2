import { expect, test } from '@playwright/test';

/** Regression guard for the nginx add_header inheritance bug, end to end through the browser. */
test('the SPA document is served with the security headers', async ({ page }) => {
  const response = await page.goto('/login');
  const headers = response!.headers();
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['x-content-type-options']).toBe('nosniff');
});

test('actuator is not exposed through the frontend origin', async ({ request }) => {
  const res = await request.get('/actuator/prometheus');
  // The SPA fallback answers with index.html: no metrics leak through nginx.
  expect(await res.text()).not.toContain('jvm_memory_used_bytes');
});
