import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';

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
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isAuthenticatedApiCall(req.url)) {
    return next(req);
  }

  const session = inject(AuthStore).session();
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
