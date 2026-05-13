# CLAUDE.md — quick reference for Claude Code sessions

Fast entry point for Claude when working in this repo. Read in this order:

1. **This file** — paths, commands, decisions you'd otherwise have to discover.
2. [`AGENTS.md`](AGENTS.md) — hard rules (architecture, testing, docs).
3. [`docs/adr/README.md`](docs/adr/README.md) — index of architectural decisions; open the matching ADR before changing anything in its area.
4. [`README.md`](README.md) — operational onboarding when a human needs it.

## What this is

Angular 20 frontend for [`backend-funeraria-app`](https://github.com/andinogabriel/backend-funeraria-app). Greenfield rewrite of the archived `funeraria-frontend` (Angular 14). Modern stack: standalone, signals, zoneless, new control flow, Material 20 (M3) + Tailwind v4, Vitest 4, ESLint flat. POC / personal project — no production users, room to move boldly.

## Where things live

| You need… | Open… |
| --- | --- |
| Bootstrap providers | `src/app/app.config.ts` |
| Top-level routes | `src/app/app.routes.ts` |
| HTTP interceptors (auth, error, correlation id) | `src/app/core/http/*.interceptor.ts` (PR1+) |
| Functional guards | `src/app/core/guards/*.guard.ts` (PR1+) |
| Shared API infra | `src/app/core/api/` — `Page<T>`, `ProblemDetail`, `toQueryParams` / `toPageQueryParams` |
| Domain types | `src/app/features/<slice>/<slice>.types.ts` (mirrors backend OpenAPI; one file per slice) |
| Feature service shape | `features/audit/audit.service.ts` is the reference; ADR-0002 describes the pattern |
| Feature components | `src/app/features/<slice>/` |
| Shared UI primitives | `src/app/shared/` |
| Material M3 theme + Tailwind import | `src/styles.scss` |
| Vitest config + global setup | `vitest.config.ts` + `src/test-setup.ts` |
| ESLint flat config | `eslint.config.js` |
| Backend proxy (dev) | `proxy.conf.json` |
| CI workflow | `.github/workflows/ci.yml` |
| ADRs | `docs/adr/000<N>-*.md` |

## Commands you'll actually run

```bash
npm ci --legacy-peer-deps   # one-time install (CI uses the same flag)
npm start                    # http://localhost:4200, proxies /api → :8081
npm test                     # vitest run
npm run test:watch           # vitest watch
npm run lint                 # ESLint
npm run format               # Prettier write
npm run format:check         # Prettier check (CI uses this)
npm run build                # prod build, esbuild, hashed assets, budgets enforced
```

CI runs format → lint → test → build, in that order. Local sequence before pushing: same.

## Decisions you'd otherwise have to rediscover

- **Zoneless from day 1.** Don't reintroduce `provideZoneChangeDetection` or `zone.js`. Async work needs to flip a signal or call a `ChangeDetectorRef` API. (See `app.config.ts`, ADR-0001.)
- **Standalone always.** No `NgModule` at the app level. Components import their own deps; route-level `providers: [...]` for slice-scoped DI. (ADR-0001.)
- **Signals first.** Reach for `BehaviorSubject` only when an existing RxJS-shaped API forces it; convert with `toSignal` at the boundary.
- **Material + Tailwind division.** Material owns components (form fields, tables, dialogs, snackbars). Tailwind owns layout, spacing, colors *outside* components. Don't override Material internals with Tailwind utility classes.
- **`legacy-peer-deps` install flag.** npm 10 + brand-new Angular 20 + Tailwind 4 surface peer-range mismatches that resolve without it. Bootstrap PR locked the convention; revisit when those settle. (See `.github/workflows/ci.yml`.)
- **Vitest test setup is zoneless.** `src/test-setup.ts` calls `setupTestBed({ zoneless: true })` from `@analogjs/vitest-angular/setup-testbed`. Don't import `setup-zone` (that's for Zone.js projects).
- **ESLint disable for empty stubs.** `src/test-setup.ts` declares `ResizeObserver` and `matchMedia` no-op stubs jsdom needs; the file-level `@typescript-eslint/no-empty-function` disable is intentional.

## Style conventions worth keeping consistent

- **Code/commits/PRs in English**, chat in Spanish — same convention as the backend.
- **PR cadence**: chained `chore/p<N>-<slug>` branches, squash-merge, auto-merge when CI is green.
- **`final` does not exist in TS**, so use `readonly` everywhere it works (signals on services, public class fields). Inputs from `input.required<T>()` or `input<T>()`.
- **Records don't exist either**, but `interface` for value shapes and `class` only when behavior is involved. Avoid `type` aliases for object shapes when an `interface` would do (better error messages).
- **No emojis in code or commits** unless explicitly requested.

## Don't

- Don't add a class-based guard, resolver, or HTTP interceptor — functional only.
- Don't bring back `*ngIf` / `*ngFor` / `*ngSwitch`. Use `@if` / `@for` / `@switch` / `@defer`.
- Don't `import 'zone.js'` anywhere; we are zoneless.
- Don't run a deep dependency upgrade in a feature PR — gate breaking dep bumps behind their own ADR + PR.
- Don't expose a writable signal from a service when a `readonly` projection is enough; consumers should not be able to `.set()` from outside.
