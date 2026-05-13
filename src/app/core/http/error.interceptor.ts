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

/**
 * Single-flight refresh + retry on 401, hard logout when refresh itself fails.
 *
 * The interceptor only kicks in for authenticated API calls — login, refresh and any
 * non-API URL pass through unchanged. When the backend returns 401 on a request that
 * carried an `Authorization` header, we attempt one rotation through `AuthService.refresh`
 * and replay the original request with the new credentials. If the refresh also returns
 * 401 (or any other failure), the session is cleared and the user is sent to `/login`.
 *
 * A module-scoped `inFlightRefresh` ensures concurrent 401s share the same rotation —
 * otherwise each parallel request would fire its own refresh and only one would actually
 * succeed against the backend's rotating refresh-token semantics.
 *
 * <h3>Why inject() at the top of the interceptor function</h3>
 *
 * `HttpInterceptorFn` is invoked inside an injection context — Angular wraps the call so
 * `inject()` works directly in the function body. RxJS callbacks (`catchError`,
 * `switchMap`, …) run outside that context, so injecting from inside `handleUnauthorized`
 * fails with NG0203. Resolving the four collaborators here once per request and passing
 * them into the helper keeps the chain in injection-context-free territory.
 *
 * <h3>User-visible feedback when the session breaks</h3>
 *
 * Earlier versions navigated to `/login` silently on refresh failure. That made the
 * "I was just here and now I'm at the login page" jump confusing. We now redirect to
 * `/login?reason=expired` (or `?reason=blocked` when the backend's threat protection
 * kicks in) so the login page can render a contextual banner. The redirect also emits
 * a structured `auth.refresh.failed` console record with the original correlation id
 * so an incident can be tied back to the matching backend log line.
 *
 * Why not a snackbar: importing `MatSnackBar` here pulled the entire
 * `@angular/material/snack-bar` package into the initial bundle (the interceptor is
 * registered in `app.config.ts`), pushing the gzipped transfer past the 100 KB
 * comfort range. The query-param redirect keeps the interceptor light.
 */
let inFlightRefresh: Observable<unknown> | null = null;

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

function shouldAttemptRefresh(req: HttpRequest<unknown>): boolean {
  if (!req.url.includes('/api/')) {
    return false;
  }
  if (req.url.endsWith('/v1/users/login') || req.url.endsWith('/v1/users/refresh')) {
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
  if (!inFlightRefresh) {
    inFlightRefresh = auth.refresh().pipe(
      catchError((refreshError: unknown) => {
        // Capture diagnostics before wiping the session so the operator (and any future
        // grep through DevTools) can correlate the logout with the matching backend log.
        const correlationId = original.headers.get('X-Correlation-Id');
        const refreshStatus =
          refreshError instanceof HttpErrorResponse ? refreshError.status : undefined;
        console.warn('auth.refresh.failed', {
          refreshStatus,
          originalUrl: original.url,
          correlationId,
        });

        store.clear();
        // Reset so the next login does not skip the refresh attempt because the chain
        // remembered a stale failure.
        inFlightRefresh = null;
        // `reason=blocked` means the threat-protection adapter rejected the refresh
        // (typically because too many failed-auth attempts blacklisted the principal);
        // `reason=expired` covers every other refresh failure shape. The login page
        // reads the query param and renders an explanatory banner.
        void router.navigate(['/login'], {
          queryParams: { reason: refreshStatus === 403 ? 'blocked' : 'expired' },
        });
        return throwError(() => refreshError);
      }),
    );
  }

  return inFlightRefresh.pipe(
    switchMap(() => {
      // Reset so future 401 chains start their own rotation.
      inFlightRefresh = null;
      // Re-issue the original request; the auth interceptor will re-stamp it with the
      // freshly-rotated Authorization header from the store.
      return next(original.clone());
    }),
  );
}
