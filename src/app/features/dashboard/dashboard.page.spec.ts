import {
  call,
  configurePage,
  flushAll,
  read,
  render,
  settle,
  textOf,
  USER,
  type PageHarness,
} from '../../../testing/page-harness';
import { DashboardPage } from './dashboard.page';
import type { DashboardMetrics, KpiMetric } from './metrics.types';

const kpi = (value: number, trendPercent: number | null = 10): KpiMetric => ({
  value,
  trendPercent,
  sparkline: [0, 1, 2, 3, 2, 1, 4, value],
});

const metrics: DashboardMetrics = {
  affiliatesActive: kpi(138, null),
  plansActive: { value: 6, trendPercent: null, sparkline: [] },
  funeralsThisMonth: kpi(4, -50),
  purchasesThisMonth: kpi(2, 100),
  criticalStock: { value: 7, trendPercent: null, sparkline: [] },
  auditedEvents24h: kpi(0, null),
};

const now = Date.now();
const iso = (msAgo: number) => new Date(now - msAgo).toISOString();
const feed = {
  entries: [
    {
      eventId: 'a',
      eventType: 'FUNERAL_CREATED',
      aggregateType: 'FUNERAL',
      aggregateId: '5',
      summary: 'Servicio',
      occurredAt: iso(10_000),
    },
    {
      eventId: 'b',
      eventType: 'AFFILIATE_CREATED',
      aggregateType: 'AFFILIATE',
      aggregateId: '1',
      summary: 'Alta',
      occurredAt: iso(5 * 60_000),
    },
    {
      eventId: 'c',
      eventType: 'AFFILIATE_DELETED',
      aggregateType: 'AFFILIATE',
      aggregateId: '2',
      summary: 'Baja',
      occurredAt: iso(3 * 3_600_000),
    },
    {
      eventId: 'd',
      eventType: 'FUNERAL_DELETED',
      aggregateType: 'FUNERAL',
      aggregateId: '6',
      summary: 'Ayer',
      occurredAt: iso(26 * 3_600_000),
    },
    {
      eventId: 'e',
      eventType: 'UNKNOWN_EVENT',
      aggregateType: 'X',
      aggregateId: '7',
      summary: 'Semana',
      occurredAt: iso(3 * 86_400_000),
    },
    {
      eventId: 'f',
      eventType: 'AFFILIATE_UPDATED',
      aggregateType: 'AFFILIATE',
      aggregateId: '8',
      summary: 'Viejo',
      occurredAt: iso(30 * 86_400_000),
    },
    {
      eventId: 'g',
      eventType: 'FUNERAL_UPDATED',
      aggregateType: 'FUNERAL',
      aggregateId: '9',
      summary: 'Raro',
      occurredAt: 'not-a-date',
    },
  ],
};

describe('DashboardPage', () => {
  let h: PageHarness;
  const fixtures = [
    ['/metrics/dashboard/series', kpi(30, 25)],
    ['/metrics/dashboard', metrics],
    ['/metrics/activity-feed', feed],
  ] as const;

  function setup(authorities?: readonly string[]) {
    h = configurePage({ authorities });
    const fixture = render(DashboardPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('renders the KPI snapshot and a relative-time activity feed', () => {
    const fixture = setup();
    const text = textOf(fixture);
    expect(text).toContain('138');
    expect(text).toContain('Hace unos segundos');
    expect(text).toContain('Hace 5 min');
    expect(text).toContain('Ayer');
    expect(text).toContain('Hace 3 días');
    expect(text).toContain('not-a-date');
  });

  it('recomputes a card for the selected range', () => {
    const fixture = setup();
    call(fixture, 'onServicesRange', 'YEAR');
    call(fixture, 'onPurchasesRange', 'WEEK');
    call(fixture, 'onAuditRange', 'MONTH');
    const reqs = flushAll(h.http, fixtures);
    expect(reqs.map((r) => r.request.params.get('metric'))).toEqual([
      'SERVICES',
      'PURCHASES',
      'AUDIT',
    ]);
    settle(fixture);
    expect(read(fixture, 'servicesRange')).toBe('YEAR');
    expect(textOf(fixture)).toContain('30');
  });

  it('deep-links every card to its filtered list', () => {
    const fixture = setup();
    call(fixture, 'openServices');
    call(fixture, 'openPurchases');
    call(fixture, 'openAudit');
    call(fixture, 'openCriticalStock');
    const paths = h.navigate.mock.calls.map((c: unknown[]) => (c[0] as string[])[0]);
    expect(paths).toEqual(['/servicios', '/ingresos', '/auditoria', '/items']);
    const audit = h.navigate.mock.calls[2][1] as { queryParams: { from: string; to: string } };
    expect(audit.queryParams.from <= audit.queryParams.to).toBe(true);
  });

  it('refreshes both endpoints and surfaces errors', () => {
    const fixture = setup();
    call(fixture, 'onRefresh');
    for (const req of h.http.match(() => true)) {
      req.flush(null, { status: 403, statusText: 'Forbidden' });
    }
    settle(fixture);
    expect(read(fixture, 'metricsError')).toBeTruthy();
  });

  it('shows the items shortcut instead of auditing for regular users', () => {
    const fixture = setup(USER);
    expect(read(fixture, 'isAdmin')).toBe(false);
  });
});
