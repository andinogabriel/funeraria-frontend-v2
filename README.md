# funeraria-frontend-v2

Angular 20 frontend for the [`backend-funeraria-app`](https://github.com/andinogabriel/backend-funeraria-app) backoffice. Greenfield rewrite of [`funeraria-frontend`](https://github.com/andinogabriel/funeraria-frontend) (Angular 14, archived) on a fully modern stack.

## Stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | Angular 20 | standalone components default, signals first |
| Change detection | **Zoneless** (`provideZonelessChangeDetection`) | no Zone.js, signal-driven |
| Routing | functional guards + lazy `loadComponent` | `withComponentInputBinding` + `withViewTransitions` |
| HTTP | `provideHttpClient(withFetch())` + functional interceptors | native fetch backend |
| UI | Angular Material 20 (M3) + Tailwind v4 | M3 tokens for components, Tailwind utilities for layout |
| Forms | typed reactive forms | signal forms preview deferred |
| Date | date-fns (planned, replaces moment) | not installed yet — added with first feature that needs it |
| Tests | Vitest 4 + @analogjs/vitest-angular + jsdom | Karma was deprecated in Angular 20 |
| Lint | ESLint flat config + @angular-eslint 20 | `eslint.config.js` |
| Format | Prettier | inline config in `package.json` |
| Build | `@angular/build:application` (esbuild) | bundle budgets enforced |
| CI | GitHub Actions | `npm ci --legacy-peer-deps`, format → lint → test → build |

## Prerequisites

- Node ≥ 22.12 (LTS) — see `.nvmrc`
- npm ≥ 10
- Angular CLI 20 (global, optional): `npm install -g @angular/cli@20`

## Getting started

```bash
npm ci --legacy-peer-deps        # one-time install
npm start                         # ng serve via http://localhost:4200, proxies /api → :8081
```

The dev server proxies `/api` and `/actuator` to `http://localhost:8081` (`proxy.conf.json`); start the backend with `docker compose up -d` from the `backend-funeraria-app` repo before running the frontend.

## Scripts

| Command | What it does |
| --- | --- |
| `npm start` | Dev server with HMR + backend proxy |
| `npm run build` | Production build (esbuild, hashed assets, budgets enforced) |
| `npm run watch` | Dev build in watch mode |
| `npm test` | Vitest run (CI mode) |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | ESLint flat config |
| `npm run format` / `format:check` | Prettier |

## Project layout

```
src/
├── app/
│   ├── app.config.ts        # zoneless + http + animations + router
│   ├── app.routes.ts        # top-level lazy route table
│   ├── app.ts / .html / .scss
│   └── (more added by feature PRs: core/, shared/, features/)
├── styles.scss              # Material M3 theme + Tailwind import
├── index.html               # Inter font preload
├── main.ts                  # bootstrapApplication
└── test-setup.ts            # Vitest global setup (zoneless TestBed + jsdom stubs)
```

Feature slices are introduced incrementally — see [`docs/adr/0001-modern-angular-stack.md`](docs/adr/0001-modern-angular-stack.md) for the migration plan.

## Modernization roadmap

The migration from the Angular 14 codebase is structured as a chain of small PRs (`chore/p<N>-<slug>`), squash-merged with auto-merge once CI is green. The plan is documented in `docs/adr/0001-modern-angular-stack.md`; high-level slices:

- **P0** Bootstrap (this PR) — Angular 20 base, zoneless, Material M3, Tailwind v4, Vitest, ESLint, CI, docs.
- **P1** Core + auth — env config, functional interceptors (auth, error, correlation id), JWT decode, login/refresh flow, functional auth guard, route shell + layout.
- **P2** Domain types + API services — `*.types.ts` per aggregate from the backend OpenAPI; signal-based HTTP services per feature.
- **P3** Shared UI primitives.
- **P4..N** Feature slices, one per PR (dashboard, afiliados, funerales, planes, ítems, marcas/categorías, proveedores, ingresos, usuarios, mi cuenta).

## Documentation

- [`AGENTS.md`](AGENTS.md) — hard rules for any contributor or coding agent.
- [`CLAUDE.md`](CLAUDE.md) — Claude Code quick reference (paths, commands, gotchas).
- [`docs/adr/`](docs/adr/) — architecture decision records, indexed by [`docs/adr/README.md`](docs/adr/README.md).

## Related repositories

- Backend: https://github.com/andinogabriel/backend-funeraria-app
- Old frontend (archived): https://github.com/andinogabriel/funeraria-frontend
