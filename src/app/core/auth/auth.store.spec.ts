import { TestBed } from '@angular/core/testing';

import { AuthStore } from './auth.store';
import type { JwtResponse } from './auth.types';

describe('AuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function makeJwt(overrides: Partial<JwtResponse> = {}): JwtResponse {
    return {
      authorization: 'Bearer abc.def.ghi',
      refreshToken: 'opaque-refresh',
      expiryDuration: 60_000,
      authorities: ['ROLE_ADMIN'],
      ...overrides,
    };
  }

  it('starts unauthenticated when no session is persisted', () => {
    const store = TestBed.inject(AuthStore);
    expect(store.isAuthenticated()).toBe(false);
    expect(store.session()).toBeNull();
    expect(store.authorities()).toEqual([]);
  });

  it('marks itself authenticated after setSession with a non-zero expiry', () => {
    const store = TestBed.inject(AuthStore);
    store.setSession(makeJwt());
    expect(store.isAuthenticated()).toBe(true);
    expect(store.authorities()).toEqual(['ROLE_ADMIN']);
  });

  it('treats an already-expired token as unauthenticated', () => {
    const store = TestBed.inject(AuthStore);
    store.setSession(makeJwt({ expiryDuration: -1 }));
    expect(store.isAuthenticated()).toBe(false);
  });

  it('persists the session to localStorage and rehydrates on next instantiation', () => {
    const store = TestBed.inject(AuthStore);
    store.setSession(makeJwt());
    TestBed.resetTestingModule();
    const fresh = TestBed.inject(AuthStore);
    expect(fresh.isAuthenticated()).toBe(true);
    expect(fresh.authorities()).toEqual(['ROLE_ADMIN']);
  });

  it('discards a malformed persisted blob instead of leaking it', () => {
    localStorage.setItem('funeraria.auth.session', '{not valid json');
    const store = TestBed.inject(AuthStore);
    expect(store.session()).toBeNull();
    expect(localStorage.getItem('funeraria.auth.session')).toBeNull();
  });

  it('clears both signal and persisted copy', () => {
    const store = TestBed.inject(AuthStore);
    store.setSession(makeJwt());
    store.clear();
    expect(store.isAuthenticated()).toBe(false);
    expect(localStorage.getItem('funeraria.auth.session')).toBeNull();
  });
});
