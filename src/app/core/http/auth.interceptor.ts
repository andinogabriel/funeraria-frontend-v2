import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import { getOrCreateDeviceId } from '../auth/device-id';
import { endFailedSession } from './session-expiry';

/**
 * Attaches the `Authorization` header (already in `Bearer <token>` form per the backend's
 * JwtDto contract) and `X-Device-Id` to every authenticated API call. The login and
 * refresh endpoints are excluded because the device identity is carried in the request
 * body for those calls (and the refresh token in its cookie).
 *
 * Static assets and any URL outside `/api/` are left untouched so the interceptor never
 * leaks credentials to a third-party origin.
 *
 * <h3>Pre-flight session check</h3>
 *
 * The access token is short-lived and kept in memory only. When it has expired, the
 * interceptor first trades the refresh cookie for a new one (`AuthService.refresh`, shared by
 * concurrent callers) and then sends the request, so an idle tab keeps working instead of
 * bouncing to the login page.
 *
 * With no session to refresh, the call is cut short locally with a 401 and the user is routed
 * to `/login` with the original URL preserved as `returnUrl`. Firing it anyway would just walk
 * the backend into 401 territory, and the adaptive threat protection blacklists the principal
 * after two suspicious requests.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isAuthenticatedApiCall(req.url)) {
    return next(req);
  }

  const store = inject(AuthStore);
  const router = inject(Router);

  if (store.isAuthenticated()) {
    return next(withCredentials(req, store));
  }

  if (store.canRestore()) {
    const auth = inject(AuthService);
    return auth.refresh().pipe(
      catchError((refreshError: unknown) => {
        endFailedSession(store, router, refreshError, req.url, req.headers.get('X-Correlation-Id'));
        return throwError(() => refreshError);
      }),
      switchMap(() => next(withCredentials(req, store))),
    );
  }

  // Nothing to refresh — bail before the request leaves the browser. Routing to /login
  // surfaces a clear UX (login form with a returnUrl) and keeps the call away from the
  // backend's threat-protection counter.
  void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
  return throwError(
    () =>
      new HttpErrorResponse({
        error: { code: 'auth.session.missing', detail: 'Tu sesión expiró.' },
        status: 401,
        statusText: 'Unauthorized',
        url: req.url,
      }),
  );
};

function withCredentials(req: HttpRequest<unknown>, store: AuthStore): HttpRequest<unknown> {
  const headers: Record<string, string> = { 'X-Device-Id': getOrCreateDeviceId() };
  const session = store.session();
  if (session) {
    headers['Authorization'] = session.authorization;
  }
  return req.clone({ setHeaders: headers });
}

function isAuthenticatedApiCall(url: string): boolean {
  if (!url.startsWith('/api/') && !url.includes('/api/')) {
    return false;
  }
  return !url.endsWith('/v1/users/login') && !url.endsWith('/v1/users/refresh');
}
