import { TestBed } from '@angular/core/testing';
import {
  Router,
  UrlTree,
  provideRouter,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';

import { authGuard } from './auth.guard';
import { AuthStore } from './auth.store';
import type { JwtResponse } from './auth.types';

describe('authGuard', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function runGuard(url: string): boolean | UrlTree {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
    ) as boolean | UrlTree;
  }

  it('returns true when a session is active', () => {
    const store = TestBed.inject(AuthStore);
    const jwt: JwtResponse = {
      authorization: 'Bearer t',
      refreshToken: 'r',
      expiryDuration: 60_000,
      authorities: ['ROLE_ADMIN'],
    };
    store.setSession(jwt);
    expect(runGuard('/dashboard')).toBe(true);
  });

  it('redirects to /login carrying the returnUrl when unauthenticated', () => {
    const router = TestBed.inject(Router);
    const result = runGuard('/funerales/123');
    expect(result).toBeInstanceOf(UrlTree);
    const tree = result as UrlTree;
    // Serialize the tree so we get a deterministic URL with the query param embedded.
    expect(router.serializeUrl(tree)).toBe('/login?returnUrl=%2Ffunerales%2F123');
  });
});
