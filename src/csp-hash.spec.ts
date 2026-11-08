import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Guards the Content-Security-Policy in security-headers.conf: every inline <script> in
 * src/index.html must have its sha256 whitelisted in `script-src`, otherwise the browser
 * silently refuses to run it in the Docker image (e.g. the theme bootstrap would stop working).
 */
describe('CSP inline-script hashes', () => {
  it('whitelists the sha256 of every inline script in index.html', () => {
    const html = readFileSync(resolve(process.cwd(), 'src/index.html'), 'utf8');
    const csp = readFileSync(resolve(process.cwd(), 'security-headers.conf'), 'utf8');
    const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);

    expect(inlineScripts.length).toBeGreaterThan(0);
    for (const body of inlineScripts) {
      const hash = `sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`;
      expect(csp).toContain(`'${hash}'`);
    }
  });
});
