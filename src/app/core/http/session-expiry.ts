import { HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';

import { AuthStore } from '../auth/auth.store';

/**
 * Ends a session whose refresh failed: logs a diagnostic record, clears the store and sends
 * the user to `/login` with a reason the login page turns into a banner.
 *
 * `reason=blocked` means the threat-protection adapter rejected the refresh (403, typically
 * after repeated failed-auth attempts); `reason=expired` covers every other failure, including
 * a refresh token the backend revoked for reuse.
 */
export function endFailedSession(
  store: AuthStore,
  router: Router,
  refreshError: unknown,
  originalUrl: string,
  correlationId: string | null,
): void {
  const refreshStatus = refreshError instanceof HttpErrorResponse ? refreshError.status : undefined;
  console.warn('auth.refresh.failed', { refreshStatus, originalUrl, correlationId });
  store.clear();
  void router.navigate(['/login'], {
    queryParams: { reason: refreshStatus === 403 ? 'blocked' : 'expired' },
  });
}
