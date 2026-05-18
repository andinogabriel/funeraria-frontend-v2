import { Routes } from '@angular/router';

import { authGuard } from './core/auth/auth.guard';
import { rootRedirectGuard } from './core/auth/root-redirect.guard';

/**
 * Top-level route table. Every entry uses `loadComponent` for lazy code-splitting at the
 * feature boundary, which means a fresh visitor downloads the public landing bundle only
 * and the shell + dashboard arrive as separate chunks after authentication.
 *
 * Routing layers, top to bottom:
 *
 * 1. **Public surfaces** (`/home`, `/login`) — no guard, anyone can visit.
 * 2. **Smart root** (`/`) — `rootRedirectGuard` routes authenticated visitors to
 *    `/dashboard` and everyone else to `/home`, so the bare domain shows the landing
 *    instead of bouncing the visitor to the login form.
 * 3. **Authenticated shell** — every feature lives under here, gated by `authGuard`.
 * 4. **404** — the wildcard renders `NotFoundPage` with the on-brand gravestone art.
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
    loadComponent: () => import('./core/layout/shell.component').then((m) => m.ShellComponent),
    children: [
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
      {
        path: 'servicios',
        loadComponent: () =>
          import('./features/funerals/pages/funeral-list.page').then((m) => m.FuneralListPage),
      },
      {
        path: 'servicios/nuevo',
        loadComponent: () =>
          import('./features/funerals/pages/funeral-form.page').then((m) => m.FuneralFormPage),
        data: { mode: 'create' },
      },
      {
        path: 'servicios/:id/editar',
        loadComponent: () =>
          import('./features/funerals/pages/funeral-form.page').then((m) => m.FuneralFormPage),
        data: { mode: 'edit' },
      },
      {
        // Operator-facing "my services" view backed by GET /funerals/by-user
        // (gated to ROLE_USER on the backend). Like /auditoria we don't add
        // a route guard — the backend response is the canonical authority
        // and the service surfaces a friendly 403 message if a non-USER
        // session happens to land here.
        path: 'mis-servicios',
        loadComponent: () =>
          import('./features/funerals/pages/my-funerals.page').then((m) => m.MyFuneralsPage),
      },
      {
        // Admin-only on the backend (every supplier route is gated by ROLE_ADMIN).
        // The sidebar entry also hides for non-admins so the friendly 403 only
        // surfaces if someone deep-links into the route.
        path: 'proveedores',
        loadComponent: () =>
          import('./features/suppliers/pages/supplier-list.page').then((m) => m.SupplierListPage),
      },
      {
        path: 'proveedores/nuevo',
        loadComponent: () =>
          import('./features/suppliers/pages/supplier-form.page').then((m) => m.SupplierFormPage),
        data: { mode: 'create' },
      },
      {
        path: 'proveedores/:nif/editar',
        loadComponent: () =>
          import('./features/suppliers/pages/supplier-form.page').then((m) => m.SupplierFormPage),
        data: { mode: 'edit' },
      },
      {
        // Admin-only on the backend. The list page is server-side paginated against
        // `/api/v1/incomes/paginated` with the operator's page / size / sort persisted in
        // the URL so refresh + back-button preserve state.
        path: 'ingresos',
        loadComponent: () =>
          import('./features/incomes/pages/income-list.page').then((m) => m.IncomeListPage),
      },
      {
        path: 'ingresos/nuevo',
        loadComponent: () =>
          import('./features/incomes/pages/income-form.page').then((m) => m.IncomeFormPage),
        data: { mode: 'create' },
      },
      {
        path: 'ingresos/:receiptNumber/editar',
        loadComponent: () =>
          import('./features/incomes/pages/income-form.page').then((m) => m.IncomeFormPage),
        data: { mode: 'edit' },
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found.page').then((m) => m.NotFoundPage),
  },
];
