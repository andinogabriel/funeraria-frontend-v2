# 0001. Modern Angular 20 Stack Bootstrap

## Status

Accepted

## Context

The previous frontend, [`funeraria-frontend`](https://github.com/andinogabriel/funeraria-frontend), targeted Angular 14 with NgModules, RxJS-heavy services, deprecated dependencies (`@angular/flex-layout` 13 beta, `moment.js`, `@angular-eslint` 13 against Angular 14), Karma + Jasmine for tests, and no CI/CD. It was last touched in November 2023 and has been unmaintained for ~2.5 years. Its architecture is a faithful reflection of the Angular best practices of 2022; nothing about it is broken, it is simply far enough from current that incremental modernization (`ng update` chaining 14 → 20 across six majors) would cost more than rewriting it on a clean baseline — especially because the goal is to also adopt the post-v17 patterns (standalone, signals, zoneless, new control flow) that `ng update` does not migrate to automatically.

The backend ([`backend-funeraria-app`](https://github.com/andinogabriel/backend-funeraria-app)) is on Java 25 + Spring Boot 4.0.6 with a documented modernization roadmap of 12 ADRs. The frontend rewrite is the natural counterpart — same project, same author, same disciplined cadence — and the chance to align both halves on contemporary practices.

## Decision

Greenfield Angular 20 application in a fresh repository (`funeraria-frontend-v2`), built on the modern Angular surface end-to-end. The previous repository is left untouched and will be archived once this rewrite reaches feature parity.

### Stack

| Concern | Choice | Rationale |
| --- | --- | --- |
| Framework | Angular 20 | Latest stable; standalone components and signals are the default surface |
| Change detection | Zoneless (`provideZonelessChangeDetection`) | Removes the Zone.js polyfill (~30 KB), simpler async semantics, signals-first ecosystem |
| Component model | Standalone everywhere | NgModules are legacy; standalone is the default schematic output in v17+ |
| State | Signals + signal-based services | Stable in v20; replaces the BehaviorSubject + RxJS scaffolding pattern |
| Control flow | `@if` / `@for` / `@switch` / `@defer` | Better tooling, types, performance vs structural directives |
| DI | `inject()` everywhere | Works in functional guards/interceptors/resolvers; cleaner than constructor injection |
| Routing | Functional guards + `loadComponent` + `withComponentInputBinding()` + `withViewTransitions()` | Modern surface, route params arrive as inputs |
| HTTP | `provideHttpClient(withFetch(), withInterceptors([]))` | Functional interceptors, native fetch backend |
| Forms | Typed reactive forms (`NonNullableFormBuilder`) | Signal forms are still preview as of v20; typed reactive is prod-ready |
| UI components | Angular Material 20 (M3) | Official, signals-first, accessibility, M3 tokens |
| UI utilities / layout | Tailwind v4 (CSS-first config via `@theme`) | Replaces deprecated `@angular/flex-layout`; zero JS, no `tailwind.config.js` |
| Date | `date-fns` (added with the first feature that needs it) | Replaces deprecated `moment.js`; tree-shakable |
| Tests | Vitest 4 + `@analogjs/vitest-angular` + jsdom | Karma is deprecated in Angular 20; Vitest is the community-aligned successor |
| Lint | ESLint flat config + `@angular-eslint` 20 | Aligns with Angular 20; flat config is the supported format |
| Format | Prettier (config inline in `package.json`) | Single source of style truth |
| Build | `@angular/build:application` (esbuild) | Default v17+; budgets enforced (500 KB initial warning, 1 MB error) |
| CI | GitHub Actions | Mirrors the backend's discipline (CI-as-the-truth) |

### Conventions

- Branches: `chore/p<N>-<slug>` for infrastructure, `feat/<slug>` for product features. Squash-merge with auto-merge enabled on the repo.
- Layers: `core/` (cross-cutting infra), `shared/` (presentational primitives), `features/<slice>/` (one folder per business domain). Sibling features are not allowed to import each other.
- Domain types live in `<slice>/<aggregate>.types.ts` — the previous frontend kept types embedded inside components and services, which made the contract with the backend invisible. This time the types are explicit.

### Migration plan (PR roadmap)

| PR | Slice | Delivers |
| --- | --- | --- |
| **P0** (this PR) | Bootstrap | Angular 20 base, zoneless, Material M3, Tailwind v4, Vitest, ESLint flat, CI, docs (`README`, `AGENTS`, `CLAUDE`, ADR-0001) |
| **P1** | Core + auth | Env config, functional interceptors (auth, error, correlation id), JWT decode, login/refresh flow, functional auth guard, route shell + layout |
| **P2** | Domain types + API services | `<slice>/<aggregate>.types.ts` per aggregate from the backend OpenAPI; signal-based HTTP services |
| **P3** | Shared UI primitives | Confirm dialog, alert, table, address/telephone form, spinner, validators custom — modernized |
| **P4..N** | Feature slices, one per PR | Dashboard, afiliados, funerales, fallecidos, planes, ítems, marcas/categorías, proveedores, ingresos, usuarios (incl. audit log read API consumption from backend PR #36), mi cuenta |
| **PΩ** | Cutover | Archive the old repo, redirect any external references |

Estimated total: 12–18 PRs.

## Consequences

**Pros**

- Every component is born modern: standalone, signals, new control flow, zoneless. No legacy debt to migrate later.
- Bundle is small from day 1 (no Zone.js, esbuild output, Tailwind purge, Material tree-shaking via standalone imports).
- Tests run on Vitest, which is faster than Karma and aligns with the broader JS ecosystem.
- CI/CD discipline imported from the backend on day 1 — every PR exercises lint → test → build before merge.
- Documentation conventions (`AGENTS.md`, `CLAUDE.md`, `docs/adr/`) ported from the backend keep onboarding cheap for both humans and agents.

**Cons / trade-offs**

- Greenfield means feature parity has to be reached before the old frontend can be archived. During the transition both repos exist; users (none currently — POC) would have to know which is which.
- Some patterns are at the edge of what is stable in Angular 20: signal forms are still preview, zoneless test setup leans on `@analogjs/vitest-angular`. We accept this; the alternative is more legacy debt for marginal stability gain.
- Tailwind v4 + Material M3 token interplay is well supported but evolving; if the design language tightens, customizing the M3 theme will be the larger effort, not Tailwind.
- `npm ci --legacy-peer-deps` is required because npm 10 surfaces peer-range mismatches in the brand-new Angular 20 + Tailwind 4 combo. Recorded so the convention is visible; revisit when the ecosystem settles.

## Validation

- `npm ci --legacy-peer-deps` clean install.
- `npm run format:check` clean.
- `npm run lint` clean.
- `npm test` — initial scaffolding spec (2 tests) passes on Vitest 4.
- `npm run build` — production bundle 256 KB initial / 70 KB transfer, well below the 500 KB budget.
- `.github/workflows/ci.yml` runs the same sequence on Node 22 (LTS, see `.nvmrc`).

## References

- Angular: https://angular.dev/
- Zoneless change detection: https://angular.dev/guide/zoneless
- Signals: https://angular.dev/guide/signals
- New control flow: https://angular.dev/guide/templates/control-flow
- Functional interceptors: https://angular.dev/guide/http/interceptors
- Angular Material 20 + M3: https://material.angular.dev/guide/theming
- Tailwind v4: https://tailwindcss.com/blog/tailwindcss-v4
- Vitest + Angular via @analogjs: https://analogjs.org/docs/features/testing/vitest
- Backend repo (matching modernization arc): https://github.com/andinogabriel/backend-funeraria-app
