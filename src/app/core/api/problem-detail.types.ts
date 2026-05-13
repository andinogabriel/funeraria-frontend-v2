/**
 * RFC 9457 Problem Details for HTTP APIs, with the small backend-specific extension
 * (`code`, `traceId`, `correlationId`) the application appends to every error response.
 *
 * Consumers should narrow on `code` (a stable identifier under the project's control) rather
 * than on `title` or `detail` (free-form human-readable strings that may be translated and
 * are not stable across versions). The `traceId` + `correlationId` pair is the link to the
 * backend's Tempo span and structured log line — surface them in dev tooling, never to the
 * end user.
 */
export interface ProblemDetail {
  readonly type?: string;
  readonly title: string;
  readonly status: number;
  readonly detail?: string;
  readonly instance: string;
  /** Stable error code under the project's control, e.g. `error.internal`. */
  readonly code: string;
  /** OpenTelemetry trace id for the failed request. Use for incident reports, not for users. */
  readonly traceId?: string;
  /** Correlation id propagated end-to-end. Use for grepping logs, not for users. */
  readonly correlationId?: string;
}

/**
 * Type guard: returns `true` when an unknown error from the HttpClient pipeline carries a
 * ProblemDetail body. The HttpClient surfaces these as `HttpErrorResponse.error`, which is
 * typed as `unknown` until inspected — this predicate is the safe gate consumers should use
 * before reading `code` or `detail`.
 */
export function isProblemDetail(value: unknown): value is ProblemDetail {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<ProblemDetail>;
  return (
    typeof candidate.title === 'string' &&
    typeof candidate.status === 'number' &&
    typeof candidate.instance === 'string' &&
    typeof candidate.code === 'string'
  );
}
