/**
 * Vitest global setup — runs once before any spec file is imported.
 *
 * Initializes the Angular testing platform in zoneless mode (matches the runtime
 * configuration in app.config.ts) and registers stubs for browser APIs that jsdom does
 * not implement. Material components query `matchMedia` and `ResizeObserver` during
 * construction, so a missing stub crashes specs that only render a button.
 */

/* eslint-disable @typescript-eslint/no-empty-function -- this file declares deliberate
 * no-op stubs for browser APIs jsdom does not implement; suppressing the rule keeps the
 * stubs readable instead of dressing every method up with a synthetic body. */
import { setupTestBed } from '@analogjs/vitest-angular/setup-testbed';

setupTestBed({ zoneless: true });

// jsdom does not implement matchMedia; CDK breakpoint observer needs it.
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }),
});

// jsdom does not implement ResizeObserver; CDK virtual scroll and Material form fields use it.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

(window as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver =
  ResizeObserverStub;
