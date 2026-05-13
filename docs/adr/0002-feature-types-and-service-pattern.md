# 0002. Per-Slice Domain Types + Signal-Based API Service

## Status

Accepted

## Context

P1 wired the auth flow and put the application onto the modern stack: zoneless, signals,
standalone components, functional HTTP interceptors. The next slices (audit log, plans,
funerals, affiliates, deceased, incomes, items, suppliers, brands, categories, users) all
need to talk to the backend. Each slice has its own DTOs, its own filters, its own paging
or single-record semantics — but the surface they all expose to feature pages is the same:

- a typed read of some shape from the API
- a typed write of some shape to the API
- signal-based state for templates to bind to (loading, error, data)
- error mapping to a Spanish, user-facing string

ADR-0001 said \"signal-based services per feature\". This ADR pins down what that means
concretely so P3..N can follow the pattern without re-deciding it for each slice.

## Decision

Every feature slice follows the same five-piece skeleton inside `src/app/features/<slice>/`:

| File | What it owns |
| --- | --- |
| `<slice>.types.ts` | Transport DTOs (interfaces, string unions), one-to-one with the backend OpenAPI schemas for that slice. |
| `<slice>.service.ts` | `@Injectable({ providedIn: 'root' })`. Wraps the HTTP calls, owns the in-memory signals, maps errors to user-facing strings. |
| `<slice>.service.spec.ts` | Unit tests using `HttpTestingController`. |
| `<slice>-list.page.ts` (or similar) | Standalone component that binds to the service signals. Added when the feature ships, not in the infra PR. |
| `<slice>-list.page.spec.ts` | Component test. Added with the page. |

### Shared API infrastructure (introduced in P2)

`src/app/core/api/` holds the types and helpers every service reuses:

- `pagination.types.ts` — `Page<T>` mirror of Spring Data + `PageRequest` shape + a
  `DEFAULT_PAGE_REQUEST` constant feature services can override per call.
- `problem-detail.types.ts` — RFC 9457 type plus an `isProblemDetail` guard. The error
  interceptor and feature services both consume this; no slice should redeclare it.
- `http-helpers.ts` — `toQueryParams` and `toPageQueryParams`. Manual query-string
  concatenation is forbidden; both helpers drop nulls/undefined/empty strings and append
  array values with one entry each (the Spring `MultiValueMap` convention).

### Service shape

Every feature service:

1. Injects `HttpClient` via `inject(HttpClient)` and reads the base URL from
   `environment.apiBaseUrl`. Never hard-code paths.
2. Exposes its data as **readonly signals**, not as raw `Observable`s pushed into a
   subject. The service can still return an `Observable<T>` from the call method so that
   callers needing fine-grained reactive composition stay first-class.
3. Maintains three baseline signals: `loading`, `error` (user-facing string), and a
   domain-shaped signal (`page`, `entity`, `list`, …).
4. Maps HTTP failures to a Spanish, user-facing string in a private `mapError(err)` —
   never throws an unhandled `HttpErrorResponse` out of the public API.
5. Lets the auth + error interceptors handle 401 / refresh. Services do not retry, do
   not inspect tokens, do not touch the auth store.

### Reference implementation

`features/audit/audit.service.ts` is the reference. It pages, filters, exposes the three
baseline signals plus a derived `empty` computed, and maps three known error statuses to
Spanish. Copy-paste into new features and adjust the URL + filter shape.

## Consequences

**Pros**

- Adding a new feature service is now a 30-line task: copy the reference, change the URL,
  change the filter type, add the spec. The interesting code lives in the page that consumes
  the service, not in service plumbing.
- Templates stay clean (`@if (svc.loading()) { … } @if (svc.error(); as e) { … }`) because
  every service exposes the same signals with the same names.
- Tests are mechanical and fast. `HttpTestingController` covers the wire contract; no
  observable timing or marble diagrams.
- The shared `Page<T>` type lets us implement a single reusable paginator UI primitive in
  the shared layer when P3 lands. Features inherit it without rewriting.

**Cons / trade-offs**

- The pattern privileges signals over observables. Features that need complex reactive
  composition (typeahead with debounce + cancellation) still have to reach for RxJS
  inside the page; the service returning an `Observable` from `search(...)` covers that
  path but is the less ergonomic of the two.
- Three signals (`page`, `loading`, `error`) per service mean three independent reactive
  reads in the template. For very simple slices this is overkill; we accept the
  consistency tax because the alternative (per-feature ad-hoc shapes) is worse for
  onboarding.
- Error strings live inside `mapError`, which means each service hard-codes its Spanish
  copy. When i18n lands (post-MVP) the copy migrates to translation keys; the structure
  of the method stays.

## Validation

- `npm test` — `http-helpers.spec.ts`, `problem-detail.types.spec.ts` and
  `audit.service.spec.ts` cover the shared infra and the reference service end-to-end
  (16 assertions across 13 cases).
- `npm run build` — the audit slice tree-shakes into a separate lazy chunk so unrelated
  pages do not pay the cost of importing it.
- Future PRs (P3..N) each add one more `*.service.spec.ts` exercising the same pattern;
  failures there flag a drift from the reference shape that this ADR locks in.

## References

- ADR-0001 — modern Angular stack bootstrap (decided to use signal-based services).
- Backend ADR-0010 — audit log read API (the contract this slice consumes).
- Spring Data `Page<T>` Jackson representation:
  https://docs.spring.io/spring-data/commons/reference/repositories/core-domain-events.html
- RFC 9457 Problem Details for HTTP APIs: https://www.rfc-editor.org/rfc/rfc9457
