import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';
import { AuthStore } from './auth.store';
import type { JwtResponse } from './auth.types';

const REFRESH_URL = `${environment.apiBaseUrl}/v1/users/refresh`;

function jwt(overrides: Partial<JwtResponse> = {}): JwtResponse {
  return {
    authorization: 'Bearer abc.def.ghi',
    expiryDuration: 60_000,
    authorities: ['ROLE_ADMIN'],
    ...overrides,
  };
}

function setup() {
  localStorage.clear();
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting()],
  });
  return {
    service: TestBed.inject(AuthService),
    http: TestBed.inject(HttpTestingController),
    store: TestBed.inject(AuthStore),
  };
}

/** Lets the Web Lock (or the promise fallback) hand the request to HttpClient. */
async function settle(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

describe('AuthService.logout', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(() => ({ service, http, store } = setup()));

  afterEach(() => http.verify());

  it('strips the Bearer prefix before sending the access token in the logout body', () => {
    store.setSession(jwt({ authorization: 'Bearer abc.def.ghi' }));

    service.logout().subscribe();

    const req = http.expectOne(`${environment.apiBaseUrl}/v1/users/logout`);
    expect((req.request.body as { token: string }).token).toBe('abc.def.ghi');
    req.flush(null);
    expect(store.canRestore()).toBe(false);
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

  it('completes locally without a request when there is no session', () => {
    const done = vi.fn();
    service.logout().subscribe({ complete: done });
    expect(done).toHaveBeenCalled();
    http.expectNone(`${environment.apiBaseUrl}/v1/users/logout`);
  });
});

describe('AuthService.login', () => {
  it('stores the session from the response; the refresh token never reaches the client', () => {
    const { service, http, store } = setup();
    service.login('a@b.com', 'secret').subscribe();

    const req = http.expectOne(`${environment.apiBaseUrl}/v1/users/login`);
    expect(req.request.body).toMatchObject({ email: 'a@b.com', password: 'secret' });
    req.flush(jwt());

    expect(store.isAuthenticated()).toBe(true);
    expect(store.canRestore()).toBe(true);
    http.verify();
  });
});

describe('AuthService.refresh', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(() => ({ service, http, store } = setup()));

  afterEach(() => {
    http.verify();
    vi.useRealTimers();
  });

  it('sends only the device info (the cookie carries the token) and stores the new session', async () => {
    const result = vi.fn();
    service.refresh().subscribe(result);
    await settle();

    const req = http.expectOne(REFRESH_URL);
    expect(Object.keys(req.request.body as object)).toEqual(['deviceInfo']);
    req.flush(jwt({ authorization: 'Bearer rotated' }));
    await settle();

    expect(result).toHaveBeenCalledWith(expect.objectContaining({ authorization: 'Bearer rotated' }));
    expect(store.session()?.authorization).toBe('Bearer rotated');
  });

  it('shares one request between concurrent callers and starts a new one afterwards', async () => {
    const first = vi.fn();
    const second = vi.fn();
    service.refresh().subscribe(first);
    service.refresh().subscribe(second);
    await settle();

    http.expectOne(REFRESH_URL).flush(jwt());
    await settle();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    service.refresh().subscribe();
    await settle();
    http.expectOne(REFRESH_URL).flush(jwt());
    await settle();
  });

  it('retries once when another tab superseded the cookie (409)', async () => {
    vi.useFakeTimers();
    const result = vi.fn();
    service.refresh().subscribe(result);
    await vi.advanceTimersByTimeAsync(0);

    http
      .expectOne(REFRESH_URL)
      .flush({ code: 'refresh.token.error.superseded' }, { status: 409, statusText: 'Conflict' });
    await vi.advanceTimersByTimeAsync(200);

    http.expectOne(REFRESH_URL).flush(jwt());
    await vi.advanceTimersByTimeAsync(0);
    expect(result).toHaveBeenCalledTimes(1);
  });

  it('does not retry other failures', async () => {
    const failed = vi.fn();
    service.refresh().subscribe({ error: failed });
    await settle();

    http.expectOne(REFRESH_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    await settle();

    expect(failed).toHaveBeenCalled();
    http.expectNone(REFRESH_URL);
  });

  it('runs inside the cross-tab Web Lock when the browser has one', async () => {
    const request = vi.fn((_name: string, task: () => Promise<unknown>) => task());
    vi.stubGlobal('navigator', { ...navigator, locks: { request } });
    try {
      service.refresh().subscribe();
      await settle();
      http.expectOne(REFRESH_URL).flush(jwt());
      await settle();
      expect(request).toHaveBeenCalledWith('funeraria.auth.refresh', expect.any(Function));
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('AuthService.restoreSession', () => {
  let service: AuthService;
  let http: HttpTestingController;
  let store: AuthStore;

  beforeEach(() => ({ service, http, store } = setup()));

  afterEach(() => http.verify());

  it('does nothing for a browser that never signed in', async () => {
    await service.restoreSession();
    http.expectNone(REFRESH_URL);
  });

  it('does nothing when the in-memory session is still valid', async () => {
    store.setSession(jwt());
    await service.restoreSession();
    http.expectNone(REFRESH_URL);
  });

  it('trades the cookie for a new access token after a reload', async () => {
    localStorage.setItem('funeraria.auth.active', '1');
    const restored = service.restoreSession();
    await settle();
    http.expectOne(REFRESH_URL).flush(jwt());
    await restored;
    expect(store.isAuthenticated()).toBe(true);
  });

  it('starts signed out, without rejecting, when the cookie is no longer valid', async () => {
    localStorage.setItem('funeraria.auth.active', '1');
    const restored = service.restoreSession();
    await settle();
    http.expectOne(REFRESH_URL).flush(null, { status: 401, statusText: 'Unauthorized' });
    await expect(restored).resolves.toBeUndefined();
    expect(store.session()).toBeNull();
    expect(store.canRestore()).toBe(false);
  });
});
