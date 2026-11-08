import { HttpErrorResponse, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { AuthStore } from '../auth/auth.store';
import { ClientTelemetryService, MAX_ERROR_REPORTS_PER_SESSION } from './client-telemetry.service';
import { classify } from './telemetry-error-handler';

describe('ClientTelemetryService', () => {
  const authenticated = signal(true);
  let service: ClientTelemetryService;
  let http: HttpTestingController;

  beforeEach(() => {
    authenticated.set(true);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthStore, useValue: { isAuthenticated: authenticated } },
      ],
    });
    service = TestBed.inject(ClientTelemetryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('POSTs an error report with keepalive and the route pattern', () => {
    service.reportError('js', 'TypeError: x is undefined');
    const req = http.expectOne('/api/v1/client-telemetry/errors');
    expect(req.request.method).toBe('POST');
    expect(req.request.keepalive).toBe(true);
    expect(req.request.body).toEqual({
      kind: 'js',
      message: 'TypeError: x is undefined',
      route: '/',
    });
    req.flush(null);
  });

  it('deduplicates identical errors within the session', () => {
    service.reportError('js', 'boom');
    service.reportError('js', 'boom');
    http.expectOne('/api/v1/client-telemetry/errors').flush(null);
  });

  it('stops reporting after the per-session cap', () => {
    for (let i = 0; i < MAX_ERROR_REPORTS_PER_SESSION + 5; i++) {
      service.reportError('js', `error ${i}`);
    }
    const reqs = http.match('/api/v1/client-telemetry/errors');
    expect(reqs.length).toBe(MAX_ERROR_REPORTS_PER_SESSION);
    reqs.forEach((r) => r.flush(null));
  });

  it('truncates long messages', () => {
    service.reportError('js', 'x'.repeat(1000));
    const req = http.expectOne('/api/v1/client-telemetry/errors');
    expect((req.request.body as { message: string }).message.length).toBe(300);
    req.flush(null);
  });

  it('sends nothing for anonymous sessions (avoids 401 -> logout loops)', () => {
    authenticated.set(false);
    service.reportError('js', 'boom');
    service.reportWebVital('LCP', 1200, 'good');
    http.expectNone('/api/v1/client-telemetry/errors');
    http.expectNone('/api/v1/client-telemetry/web-vitals');
  });

  it('POSTs a web vital', () => {
    service.reportWebVital('LCP', 1830.5, 'good');
    const req = http.expectOne('/api/v1/client-telemetry/web-vitals');
    expect(req.request.body).toEqual({ name: 'LCP', value: 1830.5, rating: 'good', route: '/' });
    req.flush(null);
  });

  it('swallows a failed report', () => {
    service.reportError('js', 'boom');
    expect(() =>
      http
        .expectOne('/api/v1/client-telemetry/errors')
        .flush(null, { status: 500, statusText: 'Server Error' }),
    ).not.toThrow();
  });
});

describe('classify', () => {
  it('detects lazy chunk load failures', () => {
    expect(classify(new Error('Failed to fetch dynamically imported module: /chunk-ABC.js'))).toBe(
      'chunk_load',
    );
  });

  it('flags HTTP errors', () => {
    expect(classify(new HttpErrorResponse({ status: 500 }))).toBe('http');
  });

  it('defaults to js', () => {
    expect(classify(new TypeError('x is undefined'))).toBe('js');
  });
});
