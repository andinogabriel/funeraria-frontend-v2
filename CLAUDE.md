# CLAUDE.md — quick reference for Claude Code sessions

Fast entry point for Claude when working in this repo. Read in this order:

1. **This file** — paths, commands, decisions you'd otherwise have to discover.
2. [`AGENTS.md`](AGENTS.md) — hard rules (architecture, testing, docs).
3. [`docs/MEMORY_BANK.md`](docs/MEMORY_BANK.md) — system context: auth flow, HTTP pipeline, state, theme, testing, build budgets, performance.
4. [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — folder layout + copy-and-adapt recipes for adding a feature, service, guard, interceptor, shared component.
5. [`docs/adr/README.md`](docs/adr/README.md) — index of architectural decisions; open the matching ADR before changing anything in its area.
6. [`README.md`](README.md) — operational onboarding when a human needs it (Docker + dev-server flows).

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

**Pre-push checklist (non-negotiable, run in this exact order):**

```bash
npm run format         # rewrites files in place — does NOT fail on issues
npm run format:check   # same check CI runs; fails the build on a single mis-formatted file
npm run lint
npm test
npm run build
```

`npm run format:check` is the first job in CI and a single Prettier mismatch
(a long Tailwind class line, a stray trailing space inside a `<button>` tag,
an HTML attribute that ran past the 100-col print width) red-X'es the whole
pipeline before lint / test / build even run. Running `npm run format` rewrites
the offending files but does NOT exit non-zero on its own — always follow it
with `npm run format:check` so you discover the failure locally rather than on
the CI page after the push.

Common Prettier traps the agent has tripped on:
- Multi-line `<button>` openings with attributes that fit on one line after Prettier collapses them.
- `class="..."` attributes longer than 100 chars that need wrapping onto the next line.
- Inline `@if/@for` block braces (Prettier reformats whitespace around `{` / `}`).

If you are about to push, the answer to "did I run format:check?" should be
"yes, two seconds ago." If it is "I think so" — run it again.

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
- **Sub-lists inside a form / dialog / detail panel ship in a `mat-expansion-panel [expanded]="true"`** with the item count on `mat-panel-description`. Keeps the surface scannable when the list grows. See `.claude/agents/frontend-architect.md` for the full rule + examples.
- **Dynamic-add form rows — "select + one numeric input + delete" pattern** (FormArray where each row is one mat-select + one numeric input + a delete icon-button — eg. plan items) follow a fixed CSS-grid template so the visual rhythm is identical across every form:

  ```text
  grid-cols-[minmax(0,1fr) <NUMBER-COL> 40px]    /* mobile */
  sm:grid-cols-[minmax(0,1fr) <NUMBER-COL> 40px]
  ```

  - **Select** (Item, Plan, Categoria, …): `minmax(0, 1fr)` — takes every spare pixel so the operator previews more option text on mobile. NEVER `auto` and NEVER fixed-width on the select side; the whole point is to give option labels room to breathe.
  - **Numeric input — quantity** (3-digit int, eg. `Cantidad`): `116 px` mobile / `132 px` desktop. Narrow because a quantity is `1..200`, but wide enough to keep the floating `<mat-label>` from truncating and to fit the trailing "+ Agregar" button reused under the same column.
  - **Numeric input — monetary amount** (currency, eg. `Precio de compra`, `Total`): `132 px` mobile / `160 px` desktop. Wider than quantity because amounts run 6–9 chars (`$ 1.485.000`) AND because they read as money — operators expect them to look like inputs for money, not for counts.
  - **Per-row delete**: fixed `40 px` (icon-button slot). Never `auto`.
  - **"+ Agregar X" affordance — desktop**: top-right of the section header, vertically aligned with the subtitle row, AND column-aligned with the Cantidad column of the rows below. Structurally that means laying the section header out on the same grid (`grid-cols-1 sm:grid-cols-[minmax(0,1fr)_<NUMBER-COL>_40px]`) so the button sits in the same X-position as every Cantidad input. The first cell carries the `<h2>` + subtitle; the second cell carries the `<button mat-stroked-button class="hidden sm:inline-flex !w-full">`; the third cell is an `aria-hidden` spacer to keep the grid math honest. The button is invisible on mobile (`hidden`) so the a11y tree only ever exposes the variant that's visible.
  - **"+ Agregar X" affordance — mobile**: a trailing row UNDER the last item, reusing the rows' grid template. On a 360 px viewport the Cantidad column alone is too narrow for "+ Agregar" + its icon, so the button spans Cantidad + delete via `col-start-2 col-end-[-1]`. Hide on sm+ (`sm:hidden`) so the desktop variant above is the canonical one on desktop. `mt-2` between the last row and this button keeps them visually attached without crowding.

  Both buttons render the same `<button>` element with the same `(click)` handler — Tailwind's `hidden sm:inline-flex` / `sm:hidden` toggles which one is in the DOM accessibility tree per breakpoint, so screen readers only ever see one "Agregar" control.

  Mat-form-field's floating label is the silent killer of "narrow as possible" — labels like `Cantidad` need ~104 px to render at top-left without truncation when not focused. Going narrower than the values above looks clever and then breaks the moment a row blurs.

  Reference implementation: `plans/pages/plan-form.page.html` (items sub-section).

  **Scope of this rule**:

  | Form | Pattern | This rule applies? |
  | --- | --- | --- |
  | `plans/pages/plan-form.page.html` (Items del plan) | select + Cantidad + delete | **Yes** — canonical example. |
  | `funerals/pages/funeral-form.page.html` (Cantidades por item) | name/code + Cantidad (rows derived from chosen plan; no add / delete) | Partial — Cantidad width (`!w-[110px]`) tracks the rule; no "+ Agregar" button to place because the list is plan-driven, not operator-driven. |
  | `incomes/pages/income-form.page.html` (Items comprados) | select + Cantidad + Precio compra + Precio venta + delete (4-field stacked card) | **No** — different structural pattern (multi-numeric stacked card per row). Top-right "+ Agregar" stays acceptable there. |
  | `suppliers/pages/supplier-form.page.html` (Teléfonos / Direcciones) | single text input + delete (no Cantidad) | **No** — no numeric column to anchor the button to. Top-right "+ Agregar" stays acceptable there. |

  When you build a new FormArray sub-form, pick the matching row from this table. If it's a new shape, add it here so the next agent can match it.
- **No emojis in code or commits** unless explicitly requested.

## Review agents — run before opening a PR

This repo ships two read-only Claude Code subagents under `.claude/agents/`. Claude Code
discovers them automatically when you open the repo in a session — there is no extra setup,
no API key, and they consume the same plan as the rest of your session (Pro / Max / API).

| Agent | What it checks | When to call it |
| --- | --- | --- |
| `frontend-architect` | Standalone + OnPush, signals vs `BehaviorSubject`, `@if`/`@for`, `minmax(0,...)` grid tracks, URL-sync for paginated lists, `[disabled]` mixed with FormControl, locale registration, Material system tokens, ARIA on icon-only buttons. | Right before `gh pr create`, after `npm run lint && npm test && npm run build`. |
| `test-coverage-auditor` | The branches humans forget: stale service mocks after a method rename, the 403 path, the empty-optional-params branch, the URL ↔ form round-trip on paginated lists. | After the architect passes; before declaring a feature done. |

Invocation from a Claude Code session:

```text
Agent({ subagent_type: "frontend-architect",    prompt: "Review the diff against main in this branch" })
Agent({ subagent_type: "test-coverage-auditor", prompt: "Audit coverage for the current branch" })
```

Both agents are read-only: they call `Read`, `Grep`, `Glob` and `git diff` / `gh pr view`,
and return a structured report (Blockers / Worth fixing / Follow-ups) with file:line
citations. They never edit files, run `npm test`, or push commits — that is your job, on
purpose. If you disagree with a blocker, open `.claude/agents/<name>.md` and you will see
the exact rule it cited.

If you are not using Claude Code, you can still read the agent files as living checklists —
they are plain Markdown describing every convention this repo enforces.

## Don't

- Don't add a class-based guard, resolver, or HTTP interceptor — functional only.
- Don't bring back `*ngIf` / `*ngFor` / `*ngSwitch`. Use `@if` / `@for` / `@switch` / `@defer`.
- Don't `import 'zone.js'` anywhere; we are zoneless.
- Don't run a deep dependency upgrade in a feature PR — gate breaking dep bumps behind their own ADR + PR.
- Don't expose a writable signal from a service when a `readonly` projection is enough; consumers should not be able to `.set()` from outside.
- Don't `git push` without running `npm run format:check` (and lint + test) locally first. CI's first job is Prettier — a single mis-formatted attribute red-X'es the whole pipeline. See the pre-push checklist in the Commands section.
- Don't try to `git push origin main` directly. The remote rejects it — branch protection on `main` is configured to require:
  - **A PR** (`required_pull_request_reviews`, `required_approving_review_count: 0` — solo dev, no human approver needed, but the PR path itself is mandatory).
  - **Green status check**: `Verify` (the single GitHub Actions workflow).
  - **Linear history** (squash-merge only).
  - **No force-pushes, no deletions.**
  - **`enforce_admins: true`** — the rule applies to the repo owner too. Even running with the owner's token (the way this agent does), the push fails.

  If a push to main returns `protected branch hook declined`, that is the protection catching you. Recover with `git checkout -b chore/<slug>` and open a PR via `gh pr create`. Branch names follow `chore/<slug>` / `feat/<slug>` / `fix/<slug>`.
