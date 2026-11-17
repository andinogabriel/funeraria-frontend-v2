import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards the Content-Security-Policy in security-headers.snippet.template: every inline <script> in
 * src/index.html must have its sha256 whitelisted in `script-src`, otherwise the browser
 * silently refuses to run it in the Docker image (e.g. the theme bootstrap would stop working).
 */
describe('CSP inline-script hashes', () => {
  it('whitelists the sha256 of every inline script in index.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/index.html'), 'utf8');
    const csp = readFileSync(resolve(process.cwd(), 'security-headers.snippet.template'), 'utf8');
    const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

    expect(inlineScripts.length).toBeGreaterThan(0);
    for (const body of inlineScripts) {
      const hash = `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`;
      expect(csp).toContain(`'${hash}'`);
    }
  });
});

describe('CSP nonce wiring', () => {
  it('marks <app-root> with the placeholder nginx replaces and the header uses the same nonce', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/index.html'), 'utf8');
    const nginx = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8');
    const csp = readFileSync(resolve(process.cwd(), 'security-headers.snippet.template'), 'utf8');

    expect(html).toContain('<app-root ngCspNonce="__CSP_NONCE__">');
    expect(nginx).toContain("sub_filter '__CSP_NONCE__' '$request_id';");
    expect(csp).toContain("style-src 'self' 'nonce-$request_id';");
    // Only the header line counts; the template's comments mention 'unsafe-inline' on purpose.
    const header = csp
      .split(/\r?\n/)
      .find((line) => line.startsWith('add_header Content-Security-Policy'));
    expect(header).toBeDefined();
    expect(header).not.toContain('unsafe-inline');
    expect(csp).toContain("require-trusted-types-for 'script'");
  });
});
