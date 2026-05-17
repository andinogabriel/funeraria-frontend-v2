import { EnvironmentInjector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, UrlTree } from '@angular/router';

import { AuthStore } from './auth.store';
import { rootRedirectGuard } from './root-redirect.guard';

describe('rootRedirectGuard', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  function invokeGuard(): UrlTree {
    const injector = TestBed.inject(EnvironmentInjector);
    return runInInjectionContext(injector, () =>
      rootRedirectGuard({} as never, {} as never),
    ) as UrlTree;
  }

  it('redirects to /dashboard when an authenticated session is in the store', () => {
    const store = TestBed.inject(AuthStore);
    store.setSession({
      authorization: 'header.payload.sig',
      refreshToken: 'opaque',
      authorities: ['ROLE_USER'],
      expiryDuration: 60_000,
    });

    expect(invokeGuard().toString()).toBe('/dashboard');
  });

  it('redirects to /home when no session is present', () => {
    expect(invokeGuard().toString()).toBe('/home');
  });

  it('redirects to /home when the persisted session has already expired', () => {
    const store = TestBed.inject(AuthStore);
    store.setSession({
      authorization: 'header.payload.sig',
      refreshToken: 'opaque',
      authorities: ['ROLE_USER'],
      // Past expiry: isAuthenticated() should be false.
      expiryDuration: -1_000,
    });

    expect(invokeGuard().toString()).toBe('/home');
  });
});
