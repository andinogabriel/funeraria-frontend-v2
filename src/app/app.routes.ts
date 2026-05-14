import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';

/**
 * Top-level route table. Every entry uses `loadComponent` for lazy code-splitting at the
 * feature boundary, which means a fresh visitor downloads the login bundle only and the
 * shell + dashboard arrive as separate chunks after authentication.
 *
 * The shell route owns the authenticated experience: anything that needs the persistent
 * navigation surface goes inside its `children` array. Public-facing routes (login, the
 * eventual public landing page) sit at the top level so they never see the shell.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./core/layout/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
      },
      {
        path: 'afiliados',
        loadComponent: () =>
          import('./features/affiliates/pages/affiliate-list.page').then(
            (m) => m.AffiliateListPage,
          ),
      },
      {
        path: 'afiliados/nuevo',
        loadComponent: () =>
          import('./features/affiliates/pages/affiliate-form.page').then(
            (m) => m.AffiliateFormPage,
          ),
        // Route-level provider would normally feed `mode` through DI, but the form page
        // uses `input.required<'create' | 'edit'>()` which the router binds via
        // `withComponentInputBinding()` from the `data` map below.
        data: { mode: 'create' },
      },
      {
        path: 'afiliados/:dni/editar',
        loadComponent: () =>
          import('./features/affiliates/pages/affiliate-form.page').then(
            (m) => m.AffiliateFormPage,
          ),
        data: { mode: 'edit' },
      },
      {
        // Admin-only audit log. Backend gates with `ROLE_ADMIN` and returns
        // 403 for non-admins; the sidenav also hides this entry for non-admins
        // so a regular user never even sees the route. We intentionally do not
        // add a route guard — the backend response is the canonical source of
        // truth, and surfacing the 403 via the service's friendly error keeps
        // the dev experience honest when role wiring changes server-side.
        path: 'auditoria',
        loadComponent: () =>
          import('./features/audit/pages/audit-event-list.page').then((m) => m.AuditEventListPage),
      },
      {
        path: 'planes',
        loadComponent: () =>
          import('./features/plans/pages/plan-list.page').then((m) => m.PlanListPage),
      },
      {
        path: 'planes/nuevo',
        loadComponent: () =>
          import('./features/plans/pages/plan-form.page').then((m) => m.PlanFormPage),
        data: { mode: 'create' },
      },
      {
        path: 'planes/:id/editar',
        loadComponent: () =>
          import('./features/plans/pages/plan-form.page').then((m) => m.PlanFormPage),
        data: { mode: 'edit' },
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
