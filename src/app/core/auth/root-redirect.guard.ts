import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from './auth.store';

/**
 * Functional guard mounted on the root path (`''`). Sends authenticated visitors to the
 * operator dashboard and everybody else to the public landing page (`/home`). Without this
 * guard the root URL would fall through the auth shell and forward unauthenticated users to
 * `/login`, hiding the marketing landing from anyone who lands on the bare domain.
 */
export const rootRedirectGuard: CanActivateFn = () => {
  const store = inject(AuthStore);
  const router = inject(Router);

  return store.isAuthenticated()
    ? router.createUrlTree(['/dashboard'])
    : router.createUrlTree(['/home']);
};
