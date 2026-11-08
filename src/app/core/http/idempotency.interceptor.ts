import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';

/** Header the backend reads (`security.request.idempotency-key-header`). */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/** Response header the backend sets when the original request with the same key is still running. */
export const IDEMPOTENCY_STATUS_HEADER = 'Idempotency-Status';

/** Extra attempts after the first one. */
export const IDEMPOTENT_MAX_RETRIES = 2;

/** Base delay of the exponential backoff (attempt n waits base * 2^(n-1)). */
export const IDEMPOTENT_RETRY_BASE_DELAY_MS = 500;

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** Gateway / availability errors where the server may or may not have processed the request. */
const RETRYABLE_STATUSES = new Set([0, 502, 503, 504]);

/**
 * Client-side idempotency for every mutating API call.
 *
 * Stamps a fresh `Idempotency-Key` (UUID v4) on each POST / PUT / PATCH / DELETE and retries
 * the request with **the same key** when the outcome is unknown: a network failure (status 0),
 * a gateway / availability error (502 / 503 / 504), or a 409 the backend marks as "the first
 * attempt is still in progress". The backend stores the first response per key and replays it,
 * so a retry after a lost response cannot create a duplicate funeral, income or payment.
 *
 * <h3>Why the retry lives here</h3>
 *
 * Interceptors run once per subscription. If a service retried with `retry()` after
 * `http.post(...)`, every attempt would pass through this interceptor again and get a new key,
 * which defeats idempotency. Generating the key and retrying inside the same interceptor keeps
 * one key per logical operation. Downstream interceptors (auth, error/refresh) still run on
 * every attempt, so a retry always carries a fresh access token.
 *
 * A request that already carries the header (a caller that manages its own key, e.g. a form
 * that reuses one key across user-initiated resubmits) is passed through untouched.
 */
export const idempotencyInterceptor: HttpInterceptorFn = (req, next) => {
  if (
    !MUTATING_METHODS.has(req.method) ||
    !isApiRequest(req) ||
    req.headers.has(IDEMPOTENCY_KEY_HEADER)
  ) {
    return next(req);
  }
  const keyed = req.clone({ setHeaders: { [IDEMPOTENCY_KEY_HEADER]: crypto.randomUUID() } });
  return next(keyed).pipe(
    retry({
      count: IDEMPOTENT_MAX_RETRIES,
      delay: (error: unknown, attempt: number) =>
        isRetryable(error)
          ? timer(IDEMPOTENT_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1))
          : throwError(() => error),
    }),
  );
};

function isApiRequest(req: HttpRequest<unknown>): boolean {
  return req.url.startsWith('/api/') || req.url.includes('/api/');
}

function isRetryable(error: unknown): boolean {
  if (!(error instanceof HttpErrorResponse)) {
    return false;
  }
  if (RETRYABLE_STATUSES.has(error.status)) {
    return true;
  }
  return error.status === 409 && error.headers?.get(IDEMPOTENCY_STATUS_HEADER) === 'in-progress';
}
