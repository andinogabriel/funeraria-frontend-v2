import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { rootRedirectGuard } from './core/auth/root-redirect.guard';

/**
 * Top-level route table. Public surfaces live here directly; everything that
 * requires authentication is hoisted into {@code authenticated.routes.ts} and
 * pulled in via `loadChildren`, so the Material datepicker + paginator setup
 * (and their secondary entry points) only enter the bundle after the operator
 * authenticates. A fresh visitor browsing `/home` or `/login` never downloads
 * those chunks.
 *
 * Routing layers, top to bottom:
 *
 * 1. **Public surfaces** (`/home`, `/login`) — no guard, anyone can visit.
 * 2. **Smart root** (`/`) — `rootRedirectGuard` routes authenticated visitors
 *    to `/dashboard` and everyone else to `/home`, so the bare domain shows
 *    the landing instead of bouncing the visitor to the login form.
 * 3. **Authenticated subtree** — every feature lives behind `authGuard` and
 *    is loaded lazily from {@code authenticated.routes.ts}. The Material
 *    providers needed by those screens (date adapter, paginator intl) are
 *    declared inside that lazy chunk too.
 * 4. **404** — the wildcard renders `NotFoundPage` with the on-brand
 *    gravestone art.
 */
export const routes: Routes = [
  {
    path: 'home',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    // Smart root: the guard returns a UrlTree, so this route never renders a component.
    // `pathMatch: 'full'` is mandatory — otherwise the empty prefix would gobble every
    // URL and the shell underneath would never get a chance to match `/dashboard` &c.
    path: '',
    pathMatch: 'full',
    canActivate: [rootRedirectGuard],
    children: [],
  },
  {
    path: '',
    canActivate: [authGuard],
    loadChildren: () => import('./authenticated.routes').then((m) => m.AUTHENTICATED_ROUTES),
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
