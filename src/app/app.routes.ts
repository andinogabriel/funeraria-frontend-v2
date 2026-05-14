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
      {
        path: 'items',
        loadComponent: () =>
          import('./features/items/pages/item-list.page').then((m) => m.ItemListPage),
      },
      {
        path: 'items/nuevo',
        loadComponent: () =>
          import('./features/items/pages/item-form.page').then((m) => m.ItemFormPage),
        data: { mode: 'create' },
      },
      {
        path: 'items/:code/editar',
        loadComponent: () =>
          import('./features/items/pages/item-form.page').then((m) => m.ItemFormPage),
        data: { mode: 'edit' },
      },
      {
        path: 'marcas',
        loadComponent: () =>
          import('./features/brands/pages/brand-list.page').then((m) => m.BrandListPage),
      },
      {
        path: 'marcas/nueva',
        loadComponent: () =>
          import('./features/brands/pages/brand-form.page').then((m) => m.BrandFormPage),
        data: { mode: 'create' },
      },
      {
        path: 'marcas/:id/editar',
        loadComponent: () =>
          import('./features/brands/pages/brand-form.page').then((m) => m.BrandFormPage),
        data: { mode: 'edit' },
      },
      {
        path: 'categorias',
        loadComponent: () =>
          import('./features/categories/pages/category-list.page').then((m) => m.CategoryListPage),
      },
      {
        path: 'categorias/nueva',
        loadComponent: () =>
          import('./features/categories/pages/category-form.page').then((m) => m.CategoryFormPage),
        data: { mode: 'create' },
      },
      {
        path: 'categorias/:id/editar',
        loadComponent: () =>
          import('./features/categories/pages/category-form.page').then((m) => m.CategoryFormPage),
        data: { mode: 'edit' },
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
