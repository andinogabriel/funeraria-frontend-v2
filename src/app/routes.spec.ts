import type { Route } from '@angular/router';

import { routes } from './app.routes';
import { AUTHENTICATED_ROUTES } from './authenticated.routes';

/** Every route in the tree, flattened. */
function flatten(list: readonly Route[]): Route[] {
  return list.flatMap((route) => [route, ...flatten(route.children ?? [])]);
}

/**
 * Smoke test of the route tables: every lazy `loadComponent` / `loadChildren` must resolve to a
 * real export. A typo in a path or a renamed class only fails at navigation time otherwise.
 */
describe('route tables', () => {
  const all = [...flatten(routes), ...flatten(AUTHENTICATED_ROUTES)];

  it('declares the core paths', () => {
    const paths = all.map((r) => r.path);
    for (const path of [
      'login',
      'dashboard',
      'servicios',
      'ingresos',
      'items',
      'tarifario',
      'auditoria',
      '**',
    ]) {
      expect(paths).toContain(path);
    }
  });

  it('resolves every lazy component and child route table', async () => {
    let resolved = 0;
    for (const route of all) {
      if (route.loadComponent) {
        expect(await (route.loadComponent as () => Promise<unknown>)()).toBeTruthy();
        resolved++;
      }
      if (route.loadChildren) {
        expect(await (route.loadChildren as () => Promise<unknown>)()).toBeTruthy();
        resolved++;
      }
    }
    expect(resolved).toBeGreaterThan(30);
    // Imports every lazy page module: slow on a cold, instrumented CI runner.
  }, 60_000);

  it('keeps edit/create routes carrying their mode', () => {
    const forms = all.filter((r) => r.path?.endsWith('nuevo') || r.path?.endsWith('editar'));
    expect(forms.length).toBeGreaterThan(0);
    for (const route of forms) {
      expect(route.data?.['mode']).toMatch(/create|edit/);
    }
  });
});
