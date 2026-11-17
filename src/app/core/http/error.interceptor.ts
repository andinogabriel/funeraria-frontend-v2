import {
  HttpErrorResponse,
  HttpEvent,
  HttpHandlerFn,
  HttpInterceptorFn,
  HttpRequest,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import { endFailedSession } from './session-expiry';

/**
 * Refresh + retry on 401, hard logout when refresh itself fails.
 *
 * The interceptor only kicks in for authenticated API calls — login, refresh, logout and any
 * non-API URL pass through unchanged. When the backend returns 401 on a request that carried
 * an `Authorization` header (the token was revoked or expired server-side before the local
 * clock noticed), we rotate once through `AuthService.refresh` — which is single-flight, so
 * concurrent 401s share one rotation — and replay the original request with the new access
 * token. If the refresh fails, the session is cleared and the user is sent to
 * `/login?reason=expired` (or `?reason=blocked` when the backend's threat protection kicks
 * in) so the login page can render a contextual banner.
 *
 * <h3>Why the replay sets the header itself</h3>
 *
 * This interceptor runs after `authInterceptor`, so `next` goes straight to the backend: a
 * plain replay would carry the stale token that just got the 401. It is re-stamped here with
 * the token the refresh returned.
 *
 * <h3>Why inject() at the top of the interceptor function</h3>
 *
 * `HttpInterceptorFn` is invoked inside an injection context — Angular wraps the call so
 * `inject()` works directly in the function body. RxJS callbacks (`catchError`,
 * `switchMap`, …) run outside that context, so injecting from inside `handleUnauthorized`
 * fails with NG0203.
 *
 * Why not a snackbar: importing `MatSnackBar` here pulled the entire
 * `@angular/material/snack-bar` package into the initial bundle (the interceptor is
 * registered in `app.config.ts`). The query-param redirect keeps the interceptor light.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const store = inject(AuthStore);
  const router = inject(Router);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }
      if (error.status === 401 && shouldAttemptRefresh(req)) {
        return handleUnauthorized(req, next, auth, store, router);
      }
      return throwError(() => error);
    }),
  );
};

const SESSION_ENDPOINTS = ['/v1/users/login', '/v1/users/refresh', '/v1/users/logout'];

function shouldAttemptRefresh(req: HttpRequest<unknown>): boolean {
  if (!req.url.includes('/api/')) {
    return false;
  }
  if (SESSION_ENDPOINTS.some((endpoint) => req.url.endsWith(endpoint))) {
    return false;
  }
  // Only attempt refresh when an Authorization header was actually attached; otherwise
  // a 401 means "the user needs to log in", not "the access token expired".
  return req.headers.has('Authorization');
}

function handleUnauthorized(
  original: HttpRequest<unknown>,
  next: HttpHandlerFn,
  auth: AuthService,
  store: AuthStore,
  router: Router,
): Observable<HttpEvent<unknown>> {
  return auth.refresh().pipe(
    catchError((refreshError: unknown) => {
      endFailedSession(
        store,
        router,
        refreshError,
        original.url,
        original.headers.get('X-Correlation-Id'),
      );
      return throwError(() => refreshError);
    }),
    switchMap((jwt) => next(original.clone({ setHeaders: { Authorization: jwt.authorization } }))),
  );
}
