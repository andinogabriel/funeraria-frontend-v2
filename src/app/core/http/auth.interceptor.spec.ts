import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    TestBed.inject(AuthStore).clear();
  });

  afterEach(() => controller.verify());

  function signIn(): void {
    TestBed.inject(AuthStore).setSession({
      authorization: 'Bearer token-1',
      expiryDuration: 60_000,
      authorities: ['ROLE_USER'],
    } as Parameters<AuthStore['setSession']>[0]);
  }

  it('attaches the bearer token and device id to authenticated API calls', () => {
    signIn();
    http.get('/api/v1/items').subscribe();
    const req = controller.expectOne('/api/v1/items');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-1');
    expect(req.request.headers.get('X-Device-Id')).toBeTruthy();
    req.flush([]);
  });

  it('leaves non-API URLs and the login/refresh endpoints untouched', () => {
    http.get('/assets/logo.svg').subscribe();
    http.post('/api/v1/users/login', {}).subscribe();
    http.post('/api/v1/users/refresh', {}).subscribe();
    for (const url of ['/assets/logo.svg', '/api/v1/users/login', '/api/v1/users/refresh']) {
      const req = controller.expectOne(url);
      expect(req.request.headers.has('Authorization')).toBe(false);
      req.flush({});
    }
  });

  it('short-circuits with a 401 and routes to login when the session is missing', () => {
    let status = 0;
    http.get('/api/v1/items').subscribe({ error: (err) => (status = err.status) });
    controller.expectNone('/api/v1/items');
    expect(status).toBe(401);
    expect(navigate).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  describe('with an expired access token and a refresh cookie', () => {
    let refresh: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      const store = TestBed.inject(AuthStore);
      store.setSession({ authorization: 'Bearer stale', expiryDuration: -1, authorities: [] });
      refresh = vi.spyOn(TestBed.inject(AuthService), 'refresh');
    });

    it('refreshes first and sends the request with the new token', () => {
      refresh.mockImplementation(() => {
        TestBed.inject(AuthStore).setSession({
          authorization: 'Bearer fresh',
          expiryDuration: 60_000,
          authorities: ['ROLE_USER'],
        });
        return of({ authorization: 'Bearer fresh', expiryDuration: 60_000, authorities: [] });
      });

      http.get('/api/v1/items').subscribe();

      const req = controller.expectOne('/api/v1/items');
      expect(req.request.headers.get('Authorization')).toBe('Bearer fresh');
      req.flush([]);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('ends the session and never sends the request when the refresh fails', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      refresh.mockReturnValue(
        throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized' })),
      );
      let status = 0;

      http.get('/api/v1/items').subscribe({ error: (err) => (status = err.status) });

      controller.expectNone('/api/v1/items');
      expect(status).toBe(401);
      expect(TestBed.inject(AuthStore).canRestore()).toBe(false);
      expect(navigate).toHaveBeenCalledWith(['/login'], { queryParams: { reason: 'expired' } });
      expect(warn).toHaveBeenCalledWith('auth.refresh.failed', expect.anything());
    });
  });
});
