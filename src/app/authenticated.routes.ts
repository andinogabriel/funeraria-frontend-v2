import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { Routes } from '@angular/router';

import { PaginatorIntlEs } from './shared/paginator-intl.es';

/**
 * Routes that live behind {@code authGuard}: the shell chrome plus every
 * feature surface.
 *
 * <h3>Why a separate routes file</h3>
 *
 * Sibling pre-auth surfaces (`/home`, `/login`) do not use the Material
 * datepicker or paginator. Keeping those providers (and their transitive
 * `@angular/material/core` + `@angular/material/paginator` chunks) inside the
 * top-level `app.config.ts` pulled them into the initial bundle for every
 * visitor — including ones that never sign in. Hoisting the whole
 * authenticated subtree behind a `loadChildren` shifts those imports into a
 * lazy chunk that arrives only after the operator authenticates, dropping
 * the initial bundle by roughly 30 kB raw / 8 kB transfer.
 *
 * The shell is also lazy-loaded here (`loadComponent` on the parent route);
 * the previous setup did that too, just from `app.routes.ts`.
 */
export const AUTHENTICATED_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () => import('./core/layout/shell.component').then((m) => m.ShellComponent),
    providers: [
      // Material datepicker needs a date adapter. `provideNativeDateAdapter`
      // uses the JS `Date` type and is enough for the birth-date / death-date /
      // funeral-date pickers + the dateRange column-menu filter. Lifted from
      // `app.config.ts` so the secondary entry point only loads after auth.
      provideNativeDateAdapter(),
      { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
      // Spanish paginator labels for every `<mat-paginator>` in the app.
      // Lifted from `app.config.ts` so `@angular/material/paginator` stays
      // out of the pre-auth bundle.
      { provide: MatPaginatorIntl, useClass: PaginatorIntlEs },
    ],
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
        // Admin-only papelera surface for soft-deleted affiliates. No route
        // guard — the backend gates the endpoint with `ROLE_ADMIN` and the
        // sidebar hides the entry for non-admins, so deep-linking only
        // surfaces the service's friendly 403 message.
        path: 'afiliados/eliminados',
        loadComponent: () =>
          import('./features/affiliates/pages/affiliate-bin.page').then((m) => m.AffiliateBinPage),
      },
      {
        path: 'afiliados/nuevo',
        loadComponent: () =>
          import('./features/affiliates/pages/affiliate-form.page').then(
            (m) => m.AffiliateFormPage,
          ),
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
        // Admin-only papelera surface for soft-deleted plans. Backend gates
        // the endpoint with `ROLE_ADMIN`; the sibling "Papelera" header
        // button on `/planes` is hidden for non-admins.
        path: 'planes/eliminados',
        loadComponent: () =>
          import('./features/plans/pages/plan-bin.page').then((m) => m.PlanBinPage),
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
        // Admin-only papelera surface for soft-deleted funerals. No route
        // guard — the backend gates the endpoint with `ROLE_ADMIN` and the
        // sibling "Papelera" header button is hidden for non-admins.
        path: 'servicios/eliminados',
        loadComponent: () =>
          import('./features/funerals/pages/funeral-bin.page').then((m) => m.FuneralBinPage),
      },
      {
        path: 'servicios/nuevo',
        loadComponent: () =>
          import('./features/funerals/pages/funeral-form.page').then((m) => m.FuneralFormPage),
        data: { mode: 'create' },
      },
      {
        // Dedicated detail route for a single funeral. The Detalle action on
        // the listing and on the "Mis servicios" page navigates here instead
        // of opening a modal — a funeral is a legal document the operator
        // shares / prints / files, so a navigable URL is a better fit.
        path: 'servicios/:id',
        loadComponent: () =>
          import('./features/funerals/pages/funeral-detail.page').then((m) => m.FuneralDetailPage),
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
];
