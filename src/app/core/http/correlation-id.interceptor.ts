import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Stamps every outbound API request with a fresh `X-Correlation-Id`. The backend logs the
 * value alongside `X-Trace-Id` in its structured logs, so an incident report can quote one
 * id and have the operator find the matching span in Tempo plus the matching log line in
 * the journal.
 *
 * Only requests targeting the application API receive the header; static asset fetches and
 * cross-origin third-party calls are left untouched.
 */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url)) {
    return next(req);
  }
  const stamped = req.clone({
    setHeaders: { 'X-Correlation-Id': crypto.randomUUID() },
  });
  return next(stamped);
};

function isApiRequest(url: string): boolean {
  return url.startsWith('/api/') || url.includes('/api/');
}
