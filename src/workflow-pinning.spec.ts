import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Keeps every GitHub Action pinned to a full commit SHA. A tag such as `@v7` can be moved by
 * whoever controls the action's repository; a SHA cannot. The trailing `# vX.Y.Z` comment keeps
 * the version readable and lets Dependabot propose upgrades in the same form.
 */
describe('GitHub Actions pinning', () => {
  it('pins every uses: entry to a commit SHA with a version comment', () => {
    const dir = resolve(process.cwd(), '.github/workflows');
    const uses = readdirSync(dir)
      .filter((file) => /\.ya?ml$/.test(file))
      .flatMap((file) =>
        readFileSync(resolve(dir, file), 'utf8')
          .split(/\r?\n/)
          .map((line, index) => ({ where: `${file}:${index + 1}`, line }))
          .filter(({ line }) => /^\s*(- )?uses:\s/.test(line) && !line.includes('uses: ./')),
      );

    expect(uses.length).toBeGreaterThan(5);
    for (const { where, line } of uses) {
      expect(line, where).toMatch(/uses:\s+[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+# v\d+(\.\d+)*\s*$/);
    }
  });
});
