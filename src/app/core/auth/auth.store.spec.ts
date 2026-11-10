import { TestBed } from '@angular/core/testing';

import { AuthStore } from './auth.store';
import type { JwtResponse } from './auth.types';

describe('AuthStore', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => vi.restoreAllMocks());

  function makeJwt(overrides: Partial<JwtResponse> = {}): JwtResponse {
    return {
      authorization: 'Bearer abc.def.ghi',
      expiryDuration: 60_000,
      authorities: ['ROLE_ADMIN'],
      ...overrides,
    };
  }

  it('starts unauthenticated', () => {
    const store = TestBed.inject(AuthStore);
    expect(store.isAuthenticated()).toBe(false);
    expect(store.session()).toBeNull();
    expect(store.authorities()).toEqual([]);
    expect(store.canRestore()).toBe(false);
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

  it('keeps the access token in memory only: a new instance starts signed out but can restore', () => {
    const store = TestBed.inject(AuthStore);
    store.setSession(makeJwt());

    // Nothing that looks like a token reaches storage, only the "1" hint.
    const stored = Object.keys(localStorage).map((key) => localStorage.getItem(key));
    expect(stored).toEqual(['1']);
    expect(JSON.stringify(localStorage)).not.toContain('abc.def.ghi');

    TestBed.resetTestingModule();
    const fresh = TestBed.inject(AuthStore);
    expect(fresh.session()).toBeNull();
    expect(fresh.canRestore()).toBe(true);
  });

  it('purges a session persisted by builds from before the refresh cookie', () => {
    localStorage.setItem(
      'funeraria.auth.session',
      JSON.stringify({ authorization: 'Bearer old', refreshToken: 'leaked' }),
    );
    TestBed.inject(AuthStore);
    expect(localStorage.getItem('funeraria.auth.session')).toBeNull();
  });

  it('clear wipes the session and the restore hint', () => {
    const store = TestBed.inject(AuthStore);
    store.setSession(makeJwt());
    store.clear();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.canRestore()).toBe(false);
  });

  it('keeps working when localStorage throws (private mode, blocked site data)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('denied');
    });
    const store = TestBed.inject(AuthStore);
    store.setSession(makeJwt());
    expect(store.isAuthenticated()).toBe(true);
    expect(store.canRestore()).toBe(false);
    store.clear();
    expect(store.session()).toBeNull();
  });
});
