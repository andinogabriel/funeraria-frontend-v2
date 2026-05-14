import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';
import type { JwtResponse } from './auth.types';

describe('AuthService.logout', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let store: AuthStore;

  function jwt(overrides: Partial<JwtResponse> = {}): JwtResponse {
    return {
      authorization: 'Bearer abc.def.ghi',
      refreshToken: 'opaque-refresh',
      expiryDuration: 60_000,
      authorities: ['ROLE_ADMIN'],
      ...overrides,
    };
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    store = TestBed.inject(AuthStore);
  });

  afterEach(() => http.verify());

  it('strips the Bearer prefix before sending the access token in the logout body', () => {
    store.setSession(jwt({ authorization: 'Bearer abc.def.ghi' }));

    service.logout().subscribe();

    const req = http.expectOne(`${environment.apiBaseUrl}/v1/users/logout`);
    expect((req.request.body as { token: string }).token).toBe('abc.def.ghi');
    req.flush(null);
  });

  it('handles a session whose authorization already lacks a scheme prefix', () => {
    store.setSession(jwt({ authorization: 'raw.jwt.value' }));

    service.logout().subscribe();

    const req = http.expectOne(`${environment.apiBaseUrl}/v1/users/logout`);
    expect((req.request.body as { token: string }).token).toBe('raw.jwt.value');
    req.flush(null);
  });

  it('clears the store even when the server rejects the logout', () => {
    store.setSession(jwt());

    service.logout().subscribe({ error: () => undefined });
    const req = http.expectOne(`${environment.apiBaseUrl}/v1/users/logout`);
    req.flush(null, { status: 500, statusText: 'Server Error' });

    expect(store.isAuthenticated()).toBe(false);
  });
});
