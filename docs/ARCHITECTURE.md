# Architecture

How `funeraria-frontend-v2` is laid out and how to add new code without bending
the conventions the rest of the codebase already enforces.

Read [`AGENTS.md`](../AGENTS.md) first for the non-negotiable rules; this doc
shows you how to apply them in practice.

## Folder layout

```
src/app/
├── app.config.ts           App-level providers: router, HttpClient, locale,
│                           interceptors, animations, view transitions.
├── app.routes.ts           Top-level routes (lazy-loaded via loadComponent).
├── app.ts                  Root standalone component; injects ThemeService
│                           so theme override fires at boot, before any feature
│                           renders.
│
├── core/                   Cross-cutting infrastructure.
│   ├── auth/               AuthService (login/logout/refresh), AuthStore
│   │                       (signal-based session state), guards.
│   ├── http/               Functional interceptors (auth Bearer, error
│   │                       mapping, correlation id) registered in app.config.
│   ├── layout/             Shell component (toolbar + sidenav).
│   └── theme/              ThemeService (manual light/dark/auto).
│
├── shared/                 Reusable presentational primitives that are NOT
│   │                       feature-specific.
│   ├── data-table/         Server-side paginated table.
│   ├── hero-carousel/      Hero carousel for unauthenticated surfaces.
│   └── ...                 Date pickers, dialog wrappers, validators, pipes.
│
├── features/               One folder per business slice.
│   ├── auth/
│   │   ├── login/          Pages live inside their feature.
│   │   └── auth.routes.ts  Feature-local routes (referenced from app.routes).
│   ├── dashboard/
│   │   ├── components/     Feature-local presentational components.
│   │   ├── dashboard.page.*
│   │   ├── metrics.service.*
│   │   └── metrics.types.ts
│   ├── incomes/
│   │   ├── pages/
│   │   ├── income.service.*
│   │   └── income.types.ts
│   └── ...
│
├── environments/           environment.ts + environment.development.ts
└── styles.scss             Material 3 theme + Tailwind import + global resets.
```

### Dependency direction

```
features/*  →  core/  →  shared/
features/*  →  shared/
features/A  ✗  features/B   (sibling features must not import each other)
```

If two features genuinely need shared logic, lift it into `shared/` (UI) or
`core/` (cross-cutting infrastructure). Never reach sideways.

## How to add things

Every recipe below corresponds to a real example already in the codebase, so
when you hit a question the answer is "copy how the existing slice solves it"
rather than "invent something new."

### Adding a feature slice

Reference example: `src/app/features/incomes/` — list page with server-side
filters, URL sync, debounced search, and an admin-only mat-toolbar action.

1. Create `src/app/features/<slice>/` with these files:
   ```
   <slice>.types.ts        Domain types mirroring the backend wire format.
                           One interface per aggregate; no logic.
   <slice>.service.ts      HttpClient calls + signal-shaped cache (see
                           "Service pattern" below). One service per slice.
   <slice>.service.spec.ts Vitest specs with HttpTestingController.
   pages/<slice>-list.page.ts/html/scss
                           Smart component that owns the page route.
   components/             Dumb presentational components scoped to the slice.
   <slice>.routes.ts       Feature-local routes — referenced from app.routes.
   ```

2. Wire the route in `src/app/app.routes.ts` using `loadComponent`:
   ```ts
   {
     path: 'productos',
     loadComponent: () =>
       import('./features/productos/pages/producto-list.page').then(
         (m) => m.ProductoListPage,
       ),
     canActivate: [authGuard, adminGuard],
   }
   ```

3. Add the nav entry in `core/layout/shell.component.ts` if the feature is
   user-facing. Mark it `requiresAdmin: true` when appropriate so non-admins
   do not see the link.

4. Open an ADR under `docs/adr/` if the feature introduces a new pattern
   (a new state-management approach, a new third-party dep, a contract shift
   the backend has not landed yet).

### Service pattern (HTTP + signal cache)

Reference: `src/app/features/incomes/income.service.ts`. The shape every
feature service follows:

```ts
@Injectable({ providedIn: 'root' })
export class FooService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiBaseUrl}/v1/foo`;

  // Private writable signal; public readonly projection. Consumers cannot
  // .set() from outside — only .load() or other methods on this service can.
  private readonly _page = signal<FooPage | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly page = this._page.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  loadPage(query: FooPageQuery = {}): Observable<FooPage> {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams();
    if (query.page !== undefined) params = params.set('page', String(query.page));
    // ... drop blank values so the URL stays clean

    return this.http.get<FooPageWire>(`${this.endpoint}/paginated`, { params }).pipe(
      map((wire) => normalizePage(wire)),
      tap({
        next: (data) => {
          this._page.set(data);
          this._loading.set(false);
        },
        error: (err) => {
          this._loading.set(false);
          this._error.set(this.mapError(err));
        },
      }),
    );
  }

  private mapError(err: { status?: number; error?: { detail?: string } }): string {
    const status = err.status ?? 0;
    if (status === 0) return 'No se pudo contactar al servidor.';
    if (status === 401) return 'Sesión expirada. Iniciá sesión nuevamente.';
    if (status === 403) return 'No tenés permiso para esta acción.';
    return err.error?.detail ?? 'Ocurrió un error inesperado.';
  }
}
```

**Why this shape**:

- **Signals, not BehaviorSubject.** Components read synchronously via signal
  getters; `computed()` derives without subscription bookkeeping.
- **Three signals**: data + loading + error. The component renders all three
  states without juggling RxJS combinators.
- **Spanish error mapping.** Every service maps backend errors into operator-
  facing Spanish here, not in the component. Tests pin the mapping per status
  code.
- **Empty params are dropped.** A blank search box should not show as `?q=`
  in the URL; the spec checks this explicitly.

### Page component pattern (smart, OnPush, URL-synced)

Reference: `src/app/features/incomes/pages/income-list.page.ts`. The pattern
for any paginated list page:

1. **FormGroup** with `NonNullableFormBuilder` for filters. Build with the
   initial value + `disabled: true` if cascade-disabled; never use the
   `[disabled]` HTML attribute alongside `formControlName` (that triggers a
   reactive-forms warning).

2. **URL → form** via `effect()` that reads `route.queryParamMap()` as a
   signal and calls `patchValue(..., { emitEvent: false })` (the
   `emitEvent: false` is crucial — without it the form's valueChanges
   refires and re-pushes to the URL, infinite loop).

3. **Form → URL** via `valueChanges.pipe(debounceTime(250), takeUntilDestroyed())`.
   Each push resets `page` to 0 because staying on page N after narrowing
   the result set would usually render an empty grid.

4. **Stale-while-revalidate**: keep the previous page's rows visible during
   refetch so the user never sees a skeleton flash on every keystroke.

5. **Optimistic delete**: snippet the row out of the cached page before the
   server confirms, then `loadPage()` on success to reconcile.

### Shared component pattern (dumb, OnPush, signal inputs)

Reference: `src/app/shared/data-table/`. A shared component:

- Lives under `src/app/shared/<name>/`.
- Has `selector: 'app-<name>'`, `standalone: true`, `ChangeDetectionStrategy.OnPush`.
- Inputs are signals: `readonly items = input.required<readonly T[]>()`.
- Outputs are `output<T>()` (new functional output, not `EventEmitter`).
- Has its own `.scss` scoped to the component — no `::ng-deep` unless the
  comment explains why and what host class it relies on.
- Has a `.spec.ts` next to it covering the inputs/outputs surface.

### Adding a guard

Functional only. Example skeleton:

```ts
// core/auth/admin.guard.ts
export const adminGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);
  if (store.authorities().includes('ROLE_ADMIN')) return true;
  void router.navigate(['/dashboard']);
  return false;
};
```

Spec lives next to it, exercises the redirect path.

### Adding an HTTP interceptor

Functional only. Registered in `app.config.ts` under
`provideHttpClient(withInterceptors([authInterceptor, errorInterceptor]))`.
Order matters — the auth interceptor injects the Bearer token before the
error interceptor sees the response. If you add a third one, decide where it
sits relative to those two and document the reason.

### Adding a route

- Feature-local routes live in `<slice>/<slice>.routes.ts`.
- Top-level lazy loading happens in `src/app/app.routes.ts` via
  `loadComponent` (single page) or `loadChildren` (nested groups).
- Authenticated routes go through `authGuard`; admin-only routes also through
  `adminGuard`.

### Adding an environment variable

`src/environments/environment.ts` is the contract. The development variant
overrides the production defaults. Both ship with TypeScript types — adding a
new key without updating both files breaks the build, which is intentional.

## Anti-patterns

- **Reaching sideways between features.** If `incomes/` needs something from
  `affiliates/`, lift it into `shared/` or `core/`. The build does not stop
  you but ESLint should (and a future ArchUnit-equivalent rule will).
- **Writable signals exposed from services.** Always `.asReadonly()`. A
  consumer that wants to mutate must call a method, not poke the signal.
- **`BehaviorSubject` for component state.** Use a signal. RxJS at the
  boundary (HTTP, route params) is fine; in component fields it is the wrong
  primitive.
- **`*ngIf` / `*ngFor` / `*ngSwitch`** in new templates. The new control flow
  (`@if`, `@for`, `@switch`, `@defer`) is the only acceptable form.
- **Class-based guards / interceptors / resolvers.** Functional only.
- **`[disabled]` on a Material control bound to a FormControl.** Initialise
  the control with `{ value, disabled: true }` and toggle with
  `.enable()/.disable({ emitEvent: false })`. The `[disabled]` HTML attribute
  triggers a reactive-forms console warning every time it competes with the
  control's own state.
- **CSS Grid tracks defined as plain `1fr`** when the cell can hold variable-
  width content (`mat-select` with long labels, hero titles). Use
  `minmax(0, 1fr)` — plain `1fr` defaults to `min-width: auto` and leaks
  horizontal scroll.
- **Hardcoded colors instead of `--mat-sys-*` tokens.** The dark-mode toggle
  flips the tokens; literal hex values do not follow.
- **Currency / date pipes with a locale string but no `registerLocaleData`
  call in `app.config.ts`.** That triggers NG0701 at runtime. `es-AR` is
  already registered; any new locale needs the registration first.

## When to write an ADR

Add one under [`docs/adr/`](adr/) for:

- A new library bigger than a pipe or a utility (state management, table
  library, charting).
- A breaking convention change (eg. dropping a rule documented in
  `AGENTS.md`).
- A new infrastructure piece (Service Worker, Web Worker, SSR).
- An architectural pivot in how a feature consumes the backend (SSE instead
  of polling, GraphQL adapter, etc.).

Routine implementation details (a new page, a new shared component, a new
service) do **not** need an ADR. The pattern is "would the next contributor
have to read code to understand the decision?" If yes, ADR. If they can read
the existing examples and infer, no.

## How an LLM agent should onboard

In this exact order:

1. [`AGENTS.md`](../AGENTS.md) — hard rules.
2. [`CLAUDE.md`](../CLAUDE.md) — fast reference for Claude sessions.
3. [`docs/MEMORY_BANK.md`](MEMORY_BANK.md) — system context (auth flow, HTTP
   pipeline, testing, build budgets).
4. This file — folder layout + recipes.
5. The matching ADR under [`docs/adr/`](adr/) before touching its area.

The `.claude/agents/*.md` review agents (`frontend-architect`,
`test-coverage-auditor`) read these same files when invoked — they are the
shared source of truth, not Claude-specific configuration.
