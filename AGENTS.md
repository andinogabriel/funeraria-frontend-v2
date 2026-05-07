# AGENTS.md

Mandatory entry point for coding agents and new contributors working on `funeraria-frontend-v2`. Read in this order, then come back here:

1. [`README.md`](README.md) — project overview, stack, scripts.
2. [`MEMORY_BANK.md`](MEMORY_BANK.md) is intentionally not duplicated — there is none yet; the *why* lives in the ADRs.
3. [`docs/adr/README.md`](docs/adr/README.md) — index of architectural decisions. Open the matching ADR before changing anything in the area it covers.
4. [`CLAUDE.md`](CLAUDE.md) — Claude-Code-specific shortcuts (paths, commands, gotchas).

## Non-negotiable architectural rules

- **Standalone components only.** No `NgModule` at the application level. Each component imports its own dependencies; cross-cutting providers live in `app.config.ts` or feature-route `providers: [...]`.
- **Signals first** for component state (`signal`, `computed`, `effect`). Reach for `BehaviorSubject` only when an existing RxJS-shaped API forces it; convert with `toSignal` at the boundary.
- **Zoneless.** No `provideZoneChangeDetection`, no `zone.js` import. Async work must change a signal or call a `ChangeDetectorRef` API explicitly.
- **Functional everything.** Functional guards (`CanActivateFn`), functional resolvers, functional interceptors. No class-based equivalents.
- **`inject()` over constructor injection.** Cleaner, works in functional context (guards/interceptors/resolvers) and lets Angular's modern ergonomics shine.
- **New control flow** (`@if`, `@for`, `@switch`, `@defer`) — no `*ngIf`, `*ngFor`, `*ngSwitch` in new templates.
- **Lazy routes via `loadComponent`** for top-level features; `loadChildren` only when a feature genuinely needs nested route grouping.
- **Typed reactive forms.** No untyped `FormGroup`. `NonNullableFormBuilder` by default.

## Layer responsibilities

```
src/app/
├── core/        # cross-cutting infrastructure: env, http interceptors, auth state, error mapping
├── shared/      # reusable presentational primitives (table, dialog wrappers, validators, pipes)
└── features/    # one folder per business slice; routes lazy-load components from here
```

- `core/` depends on `shared/` is allowed in one direction; the reverse is not.
- `features/<slice>/` may depend on `core/` and `shared/`; it must not depend on a sibling feature.
- Domain types live in `<slice>/types.ts` (or `<slice>/<aggregate>.types.ts` when more than one aggregate). No types embedded inside components or services.

## Development rules

- Use Angular CLI 20 schematics for components/services (`ng g component path/foo --standalone`).
- Prefer `signal()` to template state, `computed()` to derived values; never expose a writable signal from a service if a `readonly` projection is enough.
- HTTP services return signals or `Observable<T>` consumed via `toSignal` at the component boundary; avoid `Promise` unless interfacing with a Web API.
- Material 20 components for forms, tables, dialogs, snackbars; Tailwind utilities for layout, spacing, colors. Do not mix the two responsibilities.
- Keep CSS scoped to the component (`styleUrl`); reach for `styles.scss` only for app-wide theming or Tailwind directives.
- Never log credentials, JWTs, refresh tokens or DNI/NIF.

## Testing rules

- Vitest 4 + `@analogjs/vitest-angular` + jsdom — see `vitest.config.ts` and `src/test-setup.ts`.
- Co-locate specs (`foo.component.ts` ↔ `foo.component.spec.ts`).
- Test the public surface (rendered output, exposed signals, dispatched effects). Do not assert on Angular internals.
- Coverage threshold to be defined in PR-1 once the first real feature lands.

## Documentation rules

- Update `README.md` when onboarding or scripts change.
- Add an ADR under `docs/adr/` for any non-obvious decision (UI library swap, state management library introduction, breaking convention change). Number sequentially; update `docs/adr/README.md`.
- Keep Javadoc-style comments on cross-cutting infrastructure (interceptors, guards, complex services); features can rely on plain code clarity.

## Quick contributor checklist

Before opening a PR:

1. `npm run format` (Prettier) — repo style is enforced in CI.
2. `npm run lint` — ESLint flat config must pass.
3. `npm test` — Vitest must pass.
4. `npm run build` — production bundle must build and stay under budget.
5. Branch named `chore/p<N>-<slug>` or `feat/<slug>`. Squash-merge.
