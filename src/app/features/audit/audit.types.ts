/**
 * Transport types for the audit log read API. Mirrors the backend OpenAPI under
 * `Audit events` one-to-one — keep this in sync when the contract evolves.
 */

/**
 * Closed catalog of business operations the backend records into the audit log. Kept as a
 * string union (not a TypeScript `enum`) so values serialize as-is in URLs and JSON without
 * the enum-name-vs-value indirection — and so the compiler is the source of truth when the
 * server adds a new action without us noticing.
 */
export type AuditAction =
  | 'USER_ROLE_GRANTED'
  | 'USER_ROLE_REVOKED'
  | 'USER_ACTIVATED'
  | 'AFFILIATE_CREATED'
  | 'AFFILIATE_DELETED'
  | 'FUNERAL_CREATED'
  | 'FUNERAL_DELETED'
  | 'FUNERAL_STATE_CHANGED';

/** A single audit entry returned by `GET /api/v1/audit-events`. */
export interface AuditEvent {
  readonly id: number;
  /** ISO-8601 instant (string-serialised on the wire). */
  readonly occurredAt: string;
  readonly actorEmail: string;
  readonly actorId: number | null;
  readonly action: AuditAction;
  readonly targetType: string;
  readonly targetId: string;
  readonly traceId: string | null;
  readonly correlationId: string | null;
  readonly payload: string | null;
}

/**
 * Optional criteria accepted by the audit log search endpoint. Every field is optional and
 * absent fields are dropped from the query string by the http helper; combining several
 * fields uses AND semantics on the server.
 *
 * `from` and `to` are ISO-8601 instants the backend parses with `OffsetDateTime.parse`. The
 * type is `string` (not `Date`) on purpose: the JS Date type carries timezone surprises
 * and serialization quirks that ProblemDetails do not catch — the feature layer is the right
 * place to translate user-visible date pickers into the instant strings the API expects.
 */
export interface AuditEventFilter {
  readonly actorEmail?: string;
  readonly action?: AuditAction;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly from?: string;
  readonly to?: string;
}
