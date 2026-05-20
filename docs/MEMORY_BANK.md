# Memory Bank

System context for `funeraria-frontend-v2`: the things you need to know about
how the app is wired that are not obvious from the folder structure alone.
The matching ADRs hold the *decision* for each section; this file is the
*summary* a new contributor (human or LLM) reads on landing.

If something here drifts from the code, the code is the truth — open an
issue, then update this file.

## Auth and session

- **Token model**: device-bound JWT access tokens + rotating refresh tokens.
  The backend uses ADR-0002 (device-bound authentication). The frontend
  stores tokens in memory (signal in `AuthStore`); refresh tokens roundtrip
  through HttpOnly cookies the backend sets.
- **`AuthStore`** (`src/app/core/auth/auth.store.ts`) is the single source of
  truth for "who am I". Exposes signals: `user()`, `authorities()`,
  `isAuthenticated()`. Never write to it from outside the auth feature;
  consume through the readonly projections.
- **`AuthService`** owns the login / logout / refresh HTTP calls and the
  `AuthStore` mutations. Use it; do not call `/api/auth/*` directly from
  features.
- **Guards**: `authGuard` (any authenticated user) and `adminGuard`
  (`ROLE_ADMIN` required). Functional, registered per-route in
  `app.routes.ts`. Unauthenticated → `/login`; authenticated-but-not-admin
  → `/dashboard` (no 403 surface to the user; the backend would also block).
- **Device id**: a stable client-side identifier injected as the `X-Device-Id`
  header on every authenticated request. Persisted in `localStorage` so it
  survives reloads. Backend treats a mismatch as a security signal.
- **Sensitive values are never logged.** No `console.log` of JWTs, refresh
  tokens, DNIs, NIFs, passwords, or anything that could end up in a Sentry
  breadcrumb. Audited in code review.

## HTTP pipeline

Three functional interceptors are registered in `app.config.ts` (order
matters):

1. **`authInterceptor`** — adds the `Authorization: Bearer <token>` header
   when the `AuthStore` has a session. Also injects `X-Device-Id`.
2. **`correlationIdInterceptor`** — generates a UUID per request and injects
   `X-Correlation-Id`, so a single user action is traceable across the
   backend logs and any future browser-side telemetry.
3. **`errorInterceptor`** — observes 401 responses and triggers a transparent
   token refresh + replay. Other status codes pass through; each service
   maps its own Spanish error in `mapError(...)`.

The backend exposes `/api/v1/...` and `/actuator/...`. Both are reverse-
proxied through `proxy.conf.json` in dev (so the browser sees same-origin)
and through `nginx.conf` in the Docker runtime. The base URL is read from
`environment.apiBaseUrl` — `''` in both env files because of the proxy, so
services concatenate paths like `${environment.apiBaseUrl}/v1/incomes` and
end up calling the relative `/api/v1/incomes`.

## State management

- **Signals first.** Component state, derived state, side effects:
  `signal()`, `computed()`, `effect()`. No `BehaviorSubject` for view state.
- **RxJS at the boundaries.** `HttpClient` returns `Observable<T>` and that
  is fine — services translate it into a signal at the end of the pipe via
  `tap` into a private writable signal, exposed publicly as `.asReadonly()`.
- **`toSignal()` for stream interop.** When you have a long-lived stream
  (route params, search debounce, websocket feed) convert at the consumer
  edge with `toSignal()` so the component reads it like any other signal.
- **No global state container.** No NgRx, no Akita, no Elf. Services own
  their slice's cache via signals. If two features ever need to share state
  beyond what `core/` already exposes, that is the moment to write an ADR
  proposing one, not before.

## Forms

- **Typed `ReactiveFormsModule`.** `NonNullableFormBuilder` by default. No
  untyped `FormGroup` anywhere.
- **`emitEvent: false` on programmatic patches** when you do not want
  `valueChanges` to fire — the URL ↔ form sync pattern relies on this to
  avoid infinite loops.
- **`disabled` lives in the FormControl**, not in the template. Build with
  `{ value, disabled: true }` and toggle via `.enable()` / `.disable({ emitEvent: false })`.
  Mixing `[disabled]` with `formControlName` triggers a runtime warning every
  page load.
- **Debounce form-to-URL pushes** with `debounceTime(250)` — the standard
  cadence across paginated list pages. Filter changes reset `page` to 0.

## Routing

- **Lazy by default.** Every top-level feature loads through `loadComponent`
  (or `loadChildren` when the feature has its own subtree).
- **Guards are functional.** `authGuard` for any authenticated route;
  `adminGuard` stacks on top for admin-only pages.
- **URL-sync for paginated lists.** Filter state + page + sort live in
  `queryParamMap`. Browser back / forward / refresh restore the exact view.
  The pattern is documented in `ARCHITECTURE.md`; the canonical example is
  `src/app/features/incomes/pages/income-list.page.ts`.
- **Route params are signals.** Read via `toSignal(route.paramMap)` in the
  page component; reactive effects fire when the param changes.

## Material × Tailwind

- **Material owns components.** Buttons, form fields, tables, dialogs,
  snackbars, datepickers, tooltips, menus.
- **Tailwind owns layout, spacing, color utilities.** `flex`, `gap-*`,
  `p-*`, `text-*`. Do not use Tailwind to override Material internals.
- **Colors come from `--mat-sys-*` tokens.** `var(--mat-sys-primary)`,
  `var(--mat-sys-on-surface)`, etc. Hardcoded hex values do not follow the
  dark-mode toggle.
- **`appearance="fill"` on every `mat-form-field`.** The outlined variant
  was retired after two rounds of QA found the notched-outline + Tailwind
  preflight bridge fragile. Documented in `src/styles.scss`.
- **`minmax(0, 1fr)` in CSS Grid tracks** when the cell can hold variable-
  width content. Plain `1fr` defaults to `min-width: auto` and leaks
  horizontal scroll on mobile.

## Theme

- **Three states**: `auto` (follows `prefers-color-scheme`), `light`, `dark`.
- **Persisted in `localStorage`** under `funeraria.theme`. A tiny inline
  script in `index.html` reads it before Angular bootstraps so the first
  paint already uses the chosen surface (no FOUC).
- **`ThemeService` is injected from `App` (root component)** so the effect
  that mirrors preference → `<html>` class runs at boot. Do not inject it
  from a lazy feature alone; the override would not apply on `/login` then.
- **`styles.scss`** has three layers: default light, `prefers-color-scheme:
  dark` for auto, then `html.theme-dark` / `html.theme-light` for manual
  overrides. Specificity makes the override win.

## Testing

- **Vitest 4** with `@analogjs/vitest-angular` + `jsdom`. Config in
  `vitest.config.ts`, global setup in `src/test-setup.ts` (`setupTestBed({
  zoneless: true })`).
- **Specs co-located** with the source — `foo.service.spec.ts` next to
  `foo.service.ts`, not under a parallel `src/test/` tree.
- **`provideHttpClientTesting()`** in `TestBed.configureTestingModule` for
  every service spec. `provideHttpClient()` alone is wrong — it gives you a
  real HTTP client without a controller to assert against.
- **`http.verify()` in `afterEach`** so an outstanding request from one
  spec does not bleed into the next.
- **`fakeAsync` + `tick` + `flush`** when testing signals + RxJS interop
  that needs to advance the microtask queue.
- **The branches humans forget**: 403, "all optional params undefined",
  rename round-trip, URL ↔ form bidirectional sync. The
  `test-coverage-auditor` agent under `.claude/agents/` looks for these
  specifically.

## Build and budgets

- **esbuild** through `@angular/build`. Hashed assets, source maps in dev,
  no source maps in prod by default.
- **Initial bundle budget**: 500 KB / error 1 MB (see `angular.json`). The
  pre-existing warning about 700 KB initial is documented as a known
  follow-up; do not let it slip further.
- **Per-stylesheet budget**: 4 KB warn / 8 KB error. Two pages already brush
  the warning (`home.page.scss`, `login.page.scss`); think before adding
  more inline styles to either.
- **`npm ci --legacy-peer-deps` is the install command** in CI and in the
  Dockerfile. npm 10 + Angular 20 + Tailwind 4 surface peer-range
  mismatches that resolve cleanly with the flag.

## Performance

- **Zoneless change detection.** No `zone.js` import anywhere. Async work
  must change a signal, call a `ChangeDetectorRef` API, or come from
  `HttpClient` / `EventEmitter` paths Angular instruments natively.
- **`ChangeDetectionStrategy.OnPush`** on every new component. Zoneless
  implies it but the annotation is the explicit contract.
- **View Transitions API** is enabled via `withViewTransitions()` in
  `app.config.ts`. Cross-route animations come for free; opt out per-route
  via `data: { disableViewTransition: true }` if a route needs the legacy
  instant swap.
- **Lazy load everything top-level.** Login, shell, every feature page.
  The initial bundle should only carry app shell + login.
- **No re-introduction of `BehaviorSubject`** in component code — every
  emit invalidates the subscription tree. Signals batch.

## Internationalisation

- **Single locale (`es-AR`) today.** Registered in `app.config.ts` via
  `registerLocaleData(localeEsAr)` + `{ provide: LOCALE_ID, useValue: 'es-AR' }`.
  Without that registration the `currency`/`date` pipes throw NG0701 on
  Spanish-formatted values.
- **Spanish copy in templates, English in code.** Variable names, function
  names, comments, commit messages — all English. User-facing strings —
  Spanish. The convention matches the backend.
- **No `@angular/localize` setup yet.** When the time comes (a second
  locale, an export market), open an ADR proposing the structure.

## Accessibility

- **Icon-only buttons carry `aria-label` AND `matTooltip`** with the same
  text. The tooltip is the visible hint; the aria-label is what assistive
  tech announces.
- **Form inputs use `<mat-label>`**, not a bare placeholder. Placeholders
  disappear on focus and are not announced.
- **`aria-pressed`** on toggle buttons (the theme menu is the precedent).
- **Datepickers always have the `matIconSuffix` toggle** — never just a
  click handler on a custom icon.

## Observability

- **Correlation id per request** (see HTTP pipeline above). The backend
  reads `X-Correlation-Id` from the incoming request, propagates it through
  every log line, and echoes it back on responses. A bug report that
  includes the correlation id lets you pull the exact backend log trail in
  seconds.
- **No browser-side analytics** beyond what the operator dashboard renders.
  No Google Analytics, no third-party telemetry SDK. If a real observability
  need shows up, an ADR proposes the choice.

## Where decisions live

- **ADRs** under [`adr/`](adr/). Each one is a snapshot of "we chose X over
  Y because Z" with consequences. Open one before changing anything in the
  area it covers.
- **`AGENTS.md`** at the repo root carries the non-negotiable rules.
- **`CLAUDE.md`** at the repo root is the fast reference for Claude
  sessions; the agents in `.claude/agents/` cite the same rules.
- **This file** is the system-context glue between the code, the ADRs, and
  the rule files. Drift here is a bug worth fixing.
