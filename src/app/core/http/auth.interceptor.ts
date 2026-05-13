import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { throwError } from 'rxjs';

import { AuthStore } from '../auth/auth.store';
import { getOrCreateDeviceId } from '../auth/device-id';

/**
 * Attaches the `Authorization` header (already in `Bearer <token>` form per the backend's
 * JwtDto contract) and `X-Device-Id` to every authenticated API call. The login and
 * refresh endpoints are excluded because the device identity is carried in the request
 * body for those calls; sending the header would be harmless but is documented as
 * unnecessary by the OpenAPI contract.
 *
 * Static assets and any URL outside `/api/` are left untouched so the interceptor never
 * leaks credentials to a third-party origin.
 *
 * <h3>Pre-flight session check</h3>
 *
 * Before forwarding the request, the interceptor refuses to fire authenticated API calls
 * when the local session is missing or already expired. Firing a request with no token
 * (or an obviously-expired one) just walks the backend into 401 / refresh / blacklist
 * territory — the backend's adaptive threat protection blacklists the principal after
 * two suspicious requests, and the user gets locked out for an hour. Cutting the call
 * short locally avoids the round-trip and immediately routes the user to `/login` with
 * the original URL preserved as `returnUrl`. The auth guard does the same check at
 * navigation time; this is the safety net for stale tabs that survived a token expiry.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isAuthenticatedApiCall(req.url)) {
    return next(req);
  }

  const store = inject(AuthStore);
  const router = inject(Router);

  if (!store.isAuthenticated()) {
    // Session missing or expired — bail before the request leaves the browser. Routing
    // to /login surfaces a clear UX (login form with a returnUrl) and prevents the
    // backend from counting this as a failed-auth attempt against the threat-protection
    // counter.
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
  }

  const session = store.session();
  const headers: Record<string, string> = {
    'X-Device-Id': getOrCreateDeviceId(),
  };
  if (session) {
    headers['Authorization'] = session.authorization;
  }

  return next(req.clone({ setHeaders: headers }));
};

function isAuthenticatedApiCall(url: string): boolean {
  if (!url.startsWith('/api/') && !url.includes('/api/')) {
    return false;
  }
  return !url.endsWith('/v1/users/login') && !url.endsWith('/v1/users/refresh');
}
