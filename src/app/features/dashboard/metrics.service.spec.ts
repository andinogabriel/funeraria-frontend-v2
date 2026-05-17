import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MetricsService } from './metrics.service';
import type { DashboardMetrics } from './metrics.types';

describe('MetricsService', () => {
  let service: MetricsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MetricsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function payload(): DashboardMetrics {
    return {
      affiliatesActive: { value: 42, trendPercent: null, sparkline: [1, 2, 3, 4, 5, 6, 7, 8] },
      plansActive: { value: 5, trendPercent: null, sparkline: [] },
      funeralsThisMonth: { value: 12, trendPercent: 25.0, sparkline: [0, 0, 1, 2, 0, 3, 4, 2] },
      auditedEvents24h: {
        value: 87,
        trendPercent: -10.5,
        sparkline: [5, 8, 12, 15, 11, 14, 10, 12],
      },
    };
  }

  it('GETs /api/v1/metrics/dashboard on load and exposes the snapshot through the signal', () => {
    service.load().subscribe();
    expect(service.loading()).toBe(true);

    http.expectOne('/api/v1/metrics/dashboard').flush(payload());

    expect(service.loading()).toBe(false);
    expect(service.snapshot()).toEqual(payload());
    expect(service.error()).toBeNull();
  });

  it('reports a friendly Spanish error and clears loading on 403', () => {
    service.load().subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/metrics/dashboard')
      .flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No tenés permiso para ver los indicadores.');
  });

  it('reports a network-down message on status 0', () => {
    service.load().subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/metrics/dashboard')
      .error(new ProgressEvent('error'), { status: 0, statusText: '' });

    expect(service.error()).toBe('No se pudo contactar al servidor.');
  });
});
