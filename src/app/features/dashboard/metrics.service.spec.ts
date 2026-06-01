import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MetricsService } from './metrics.service';
import type { ActivityFeedResponse, DashboardMetrics } from './metrics.types';

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
      purchasesThisMonth: { value: 9, trendPercent: 12.5, sparkline: [0, 1, 0, 2, 1, 3, 1, 1] },
      criticalStock: { value: 3, trendPercent: null, sparkline: [] },
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

  it('GETs the series endpoint with metric + range params and returns the recomputed KPI', () => {
    const metric = { value: 30, trendPercent: 50, sparkline: [1, 2, 3, 4, 5, 6, 7, 8] };
    let received: typeof metric | undefined;
    service.loadSeries('SERVICES', 'YEAR').subscribe((m) => (received = m));

    const req = http.expectOne(
      (r) =>
        r.url === '/api/v1/metrics/dashboard/series' &&
        r.params.get('metric') === 'SERVICES' &&
        r.params.get('range') === 'YEAR',
    );
    req.flush(metric);

    expect(received).toEqual(metric);
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

  // --------------------------------------------------------------------------
  // Activity feed (ADR-0014)
  // --------------------------------------------------------------------------

  function feedPayload(): ActivityFeedResponse {
    return {
      entries: [
        {
          eventId: '11111111-1111-1111-1111-111111111111',
          eventType: 'FUNERAL_CREATED',
          aggregateType: 'FUNERAL',
          aggregateId: '42',
          summary: 'Nuevo servicio registrado: recibo REC-001 para Juan Pérez (total $250000)',
          occurredAt: '2026-05-19T12:00:00Z',
        },
      ],
    };
  }

  it('GETs /api/v1/metrics/activity-feed without a limit when the caller omits it', () => {
    service.loadActivityFeed().subscribe();
    expect(service.activityFeedLoading()).toBe(true);

    const req = http.expectOne((r) => r.url === '/api/v1/metrics/activity-feed');
    expect(req.request.params.has('limit')).toBe(false);
    req.flush(feedPayload());

    expect(service.activityFeedLoading()).toBe(false);
    expect(service.activityFeed()).toEqual(feedPayload().entries);
    expect(service.activityFeedError()).toBeNull();
  });

  it('forwards the supplied limit onto the activity-feed request', () => {
    service.loadActivityFeed(10).subscribe();

    const req = http.expectOne((r) => r.url === '/api/v1/metrics/activity-feed');
    expect(req.request.params.get('limit')).toBe('10');
    req.flush(feedPayload());
  });

  it('drops a non-positive limit so the backend default applies', () => {
    service.loadActivityFeed(0).subscribe();

    const req = http.expectOne((r) => r.url === '/api/v1/metrics/activity-feed');
    expect(req.request.params.has('limit')).toBe(false);
    req.flush(feedPayload());
  });

  it('exposes a friendly Spanish error and clears loading on 403 of the activity feed', () => {
    service.loadActivityFeed().subscribe({ error: () => undefined });
    http
      .expectOne((r) => r.url === '/api/v1/metrics/activity-feed')
      .flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.activityFeedLoading()).toBe(false);
    expect(service.activityFeedError()).toBe('No tenés permiso para ver los indicadores.');
    expect(service.activityFeed()).toBeNull();
  });

  it('exposes an empty entries list as an empty array (not null) so the page distinguishes loaded-empty from never-loaded', () => {
    service.loadActivityFeed().subscribe();
    http
      .expectOne((r) => r.url === '/api/v1/metrics/activity-feed')
      .flush({ entries: [] } satisfies ActivityFeedResponse);

    expect(service.activityFeed()).toEqual([]);
  });
});
