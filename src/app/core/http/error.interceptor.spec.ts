import {
  HttpClient,
  HttpErrorResponse,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
  TestRequest,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';

import { errorInterceptor } from './error.interceptor';

/**
 * Regression coverage for the session-expired flow.
 *
 * <p>The interceptor lives between every API call and the operator's screen,
 * so we validate the contract that matters in production:
 *
 * <ul>
 *   <li>When the backend returns a 401 with the documented Spring Boot
 *       BasicErrorController body shape ({@code timestamp, status, error,
 *       message, path}) on a protected request, the interceptor MUST attempt
 *       a single refresh before surfacing the error.</li>
 *   <li>When the refresh itself fails (also a 401 with the same body shape —
 *       the matching backend log line is {@code security.jwt.expired} per
 *       {@code JwtTokenFilter}), the interceptor MUST clear the session AND
 *       redirect to {@code /login} with {@code reason=expired} so the login
 *       page can render the contextual banner.</li>
 *   <li>403 on the refresh (the threat-protection adapter's blacklist branch)
 *       carries {@code reason=blocked} instead — different copy on the
 *       banner, same redirect.</li>
 *   <li>A 401 WITHOUT an Authorization header (eg. the login call itself, or
 *       any anonymous probe) must NOT trigger a refresh — that path means
 *       "the user needs to log in", not "the access token expired".</li>
 * </ul>
 */
describe('errorInterceptor', () => {
  // The exact JSON shape Spring Boot writes when `server.error.include-message=
  // always` is set and JwtTokenFilter falls into its `handleUnauthorized`
  // branch on an expired token. We mirror it byte-for-byte so the test is
  // honest about what the backend sends — not a synthetic shape we wish it
  // sent.
  const expiredBody = {
    timestamp: '2026-05-29T17:42:00.123+00:00',
    status: 401,
    error: 'Unauthorized',
    message: 'Token expirado',
    path: '/api/v1/items',
  } as const;

  let http: HttpClient;
  let httpMock: HttpTestingController;
  let authRefresh: ReturnType<typeof vi.fn>;
  let storeClear: ReturnType<typeof vi.fn>;
  let routerNavigate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    authRefresh = vi.fn();
    storeClear = vi.fn();
    routerNavigate = vi.fn(() => Promise.resolve(true));

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { refresh: authRefresh } },
        { provide: AuthStore, useValue: { clear: storeClear } },
        { provide: Router, useValue: { navigate: routerNavigate } },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  /**
   * Helper — fires a GET against a protected URL with an Authorization
   * header, returns the matching {@link TestRequest} for the caller to flush
   * the simulated response.
   */
  function getProtected(path = '/api/v1/items'): {
    request: TestRequest;
    onError: ReturnType<typeof vi.fn>;
  } {
    const onError = vi.fn();
    http
      .get(path, { headers: { Authorization: 'Bearer access-token' } })
      .subscribe({ next: () => undefined, error: onError });
    return { request: httpMock.expectOne(path), onError };
  }

  it('attempts a refresh on 401 when the request carried an Authorization header', () => {
    authRefresh.mockReturnValue(of({ accessToken: 'new', refreshToken: 'new' }));

    const { request } = getProtected();
    request.flush(expiredBody, { status: 401, statusText: 'Unauthorized' });

    expect(authRefresh).toHaveBeenCalledTimes(1);

    // Refresh succeeded — interceptor replays the original request. We flush
    // it with a success so the assertion chain completes cleanly.
    const replay = httpMock.expectOne('/api/v1/items');
    replay.flush({});
  });

  it('redirects to /login?reason=expired when refresh ALSO returns 401 with the documented body', () => {
    const refreshError = new HttpErrorResponse({
      error: { ...expiredBody, path: '/api/v1/users/refresh' },
      status: 401,
      statusText: 'Unauthorized',
    });
    authRefresh.mockReturnValue(throwError(() => refreshError));

    const { request, onError } = getProtected();
    request.flush(expiredBody, { status: 401, statusText: 'Unauthorized' });

    expect(storeClear).toHaveBeenCalledTimes(1);
    expect(routerNavigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'expired' },
    });
    expect(onError).toHaveBeenCalled();
    // The error surfaced to the caller is the refresh failure, not the
    // original — that is what the diagnostics console log keys off and what
    // any RxJS retry chain downstream should see.
    expect((onError.mock.calls[0][0] as HttpErrorResponse).status).toBe(401);
  });

  it('redirects with reason=blocked when refresh returns 403 (threat-protection adapter)', () => {
    const refreshError = new HttpErrorResponse({
      error: { ...expiredBody, status: 403, error: 'Forbidden', message: 'Acceso bloqueado' },
      status: 403,
      statusText: 'Forbidden',
    });
    authRefresh.mockReturnValue(throwError(() => refreshError));

    const { request } = getProtected();
    request.flush(expiredBody, { status: 401, statusText: 'Unauthorized' });

    expect(routerNavigate).toHaveBeenCalledWith(['/login'], {
      queryParams: { reason: 'blocked' },
    });
  });

  it('does NOT attempt a refresh when the failing request had no Authorization header', () => {
    const onError = vi.fn();
    http.get('/api/v1/items').subscribe({ next: () => undefined, error: onError });

    const request = httpMock.expectOne('/api/v1/items');
    request.flush(expiredBody, { status: 401, statusText: 'Unauthorized' });

    expect(authRefresh).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });

  it('does NOT attempt a refresh on the login endpoint itself (would deadlock the auth chain)', () => {
    const onError = vi.fn();
    http
      .post('/api/v1/users/login', { email: 'x', password: 'y' })
      .subscribe({ next: () => undefined, error: onError });

    const request = httpMock.expectOne('/api/v1/users/login');
    request.flush(
      { ...expiredBody, path: '/api/v1/users/login', message: 'Credenciales inválidas' },
      { status: 401, statusText: 'Unauthorized' },
    );

    expect(authRefresh).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalled();
  });
});
