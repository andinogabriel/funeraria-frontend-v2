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

The fastest path: run the backend in Docker, then the frontend with `ng serve`.

### Step 1: start the backend

In the [`backend-funeraria-app`](https://github.com/andinogabriel/backend-funeraria-app)
repo (clone it next to this one):

```bash
docker compose up -d
# Backend ready on http://localhost:8081, postgres on :5432.
```

### Step 2: install + run the frontend

```bash
nvm use                          # picks up Node version from .nvmrc (22.x)
npm ci --legacy-peer-deps        # one-time install — see CLAUDE.md for why the flag
npm start                        # ng serve on http://localhost:4200
```

The dev server's `proxy.conf.json` forwards `/api` and `/actuator` to
`http://localhost:8081` so the browser sees same-origin requests — no CORS, no
env-specific base URLs in the bundle. Open `http://localhost:4200/login` and
sign in with the bootstrap admin credentials documented in the backend's README.

### Step 3 (optional): prod-like local stack with Docker

Sometimes you want to test the production build (nginx serving the hashed
bundle, gzip on, cache headers) instead of `ng serve`.

```bash
# Build the frontend image + start it. Backend is expected to be already up
# (step 1) on the shared `funeraria-net` Docker network.
docker compose --profile frontend up --build
# Frontend now on http://localhost:4200 (nginx, prod build).
```

The Dockerfile is multi-stage: Node 22 builds the app, nginx:alpine serves
it. `nginx.conf` proxies `/api` and `/actuator` to the backend so the browser
still sees same-origin. See [`Dockerfile`](Dockerfile) and
[`nginx.conf`](nginx.conf) for the full picture.

### Troubleshooting

- **`Cannot find module @angular/...` after pull**: rerun
  `npm ci --legacy-peer-deps`. Angular 20 minors sometimes change peer ranges.
- **Backend connection refused**: the proxy expects `:8081`. Confirm the
  backend container is healthy with `docker compose ps` in the backend repo.
- **`NG0701: Missing locale data for "es-AR"`**: only happens if someone removes the
  `registerLocaleData(localeEsAr)` call from `app.config.ts`. The locale is
  required by the currency / date pipes.
- **Login appears but submit does nothing**: usually a mismatched CSRF
  token from a stale browser session. Hard refresh + clear site data.

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

Read in this order if you are landing for the first time:

- [`AGENTS.md`](AGENTS.md) — hard rules for any contributor or coding agent.
  Standalone components only, signals first, functional interceptors,
  zoneless, etc. Non-negotiable.
- [`docs/MEMORY_BANK.md`](docs/MEMORY_BANK.md) — system context: auth flow,
  HTTP pipeline, state strategy, Material × Tailwind division, theme, tests,
  build budgets, performance.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — folder layout + copy-and-
  adapt recipes for adding a feature, a service, a guard, an interceptor, a
  shared component.
- [`CLAUDE.md`](CLAUDE.md) — Claude Code quick reference (paths, commands,
  gotchas, how to run the bundled review agents before `gh pr create`).
- [`.claude/agents/`](.claude/agents) — read-only review agents
  (`frontend-architect`, `test-coverage-auditor`) Claude Code discovers
  automatically when you open the repo. See `CLAUDE.md` for usage.
- [`docs/adr/`](docs/adr/) — architecture decision records, indexed by
  [`docs/adr/README.md`](docs/adr/README.md). Open the matching ADR before
  changing anything in the area it covers.

## Related repositories

- Backend: https://github.com/andinogabriel/backend-funeraria-app
- Old frontend (archived): https://github.com/andinogabriel/funeraria-frontend
