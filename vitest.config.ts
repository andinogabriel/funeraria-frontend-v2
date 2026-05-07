/// <reference types="vitest" />
import angular from '@analogjs/vite-plugin-angular';
import { defineConfig } from 'vite';

/**
 * Vitest configuration. Uses @analogjs/vite-plugin-angular so spec files are compiled by
 * the same Angular build pipeline that ng serve / ng build use, which means standalone
 * components, signals, the new control flow and zoneless change detection all work in
 * tests with no extra ceremony.
 *
 * - environment: jsdom — Material components query window/document APIs at construction.
 * - globals: true — `describe`, `it`, `expect`, `vi` available without imports, matching
 *   the Jasmine ergonomics the previous generation of Angular tests assumed.
 * - setupFiles: src/test-setup.ts — installs the Angular testing platform and any global
 *   stubs (matchMedia, ResizeObserver) that jsdom does not provide out of the box.
 */
export default defineConfig({
  plugins: [angular()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/app/**/*.ts'],
      exclude: ['**/*.spec.ts', '**/*.config.ts', 'src/main.ts'],
    },
  },
  define: {
    'import.meta.vitest': 'undefined',
  },
});
