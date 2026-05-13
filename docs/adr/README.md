# Architecture Decision Records

One ADR per non-obvious decision. Read the matching record before changing anything in
the area it covers — the rationale and trade-offs are recorded once here, not repeated in
every PR description.

| #    | Title                                              | Touches                                                         |
| ---- | -------------------------------------------------- | --------------------------------------------------------------- |
| [0001](0001-modern-angular-stack.md) | Modern Angular 20 stack bootstrap | Standalone, signals, zoneless, Material 20 + Tailwind v4, Vitest, ESLint flat, CI |
| [0002](0002-feature-types-and-service-pattern.md) | Per-slice domain types + signal-based API service pattern | `core/api/` (Page, ProblemDetail, http-helpers), `features/<slice>/*.types.ts` + `*.service.ts` |

## When to add a new ADR

Add one for any decision that future you (or a new contributor or agent) would otherwise
have to infer from code archaeology — UI library swap, state-management library
introduction, breaking convention change, switch to SSR, etc. Routine implementation
details do not need an ADR.

Number ADRs sequentially. Use `0001` as a template: `Status`, `Context`, `Decision`,
`Consequences` (pros / cons), `Validation`, `References`. Append the new ADR to the table
above in the same PR.
