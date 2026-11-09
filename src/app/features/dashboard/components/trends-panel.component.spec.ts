import {
  configurePage,
  render,
  settle,
  textOf,
  type PageHarness,
} from '../../../../testing/page-harness';
import type { MonthlyTrendPoint } from '../metrics.types';
import { TrendsPanelComponent } from './trends-panel.component';

const point = (month: string, o: Partial<MonthlyTrendPoint> = {}): MonthlyTrendPoint => ({
  month,
  funerals: 0,
  funeralRevenue: 0,
  purchases: 0,
  duesBilled: 0,
  duesCollected: 0,
  ...o,
});

const isTrends = (r: { url: string }) => r.url.endsWith('/metrics/trends');

describe('TrendsPanelComponent', () => {
  let h: PageHarness;

  function setup() {
    h = configurePage();
    return render(TrendsPanelComponent);
  }

  afterEach(() => h.http.verify());

  it('loads twelve months and renders the three charts with their headline figures', () => {
    const fixture = setup();
    expect(fixture.nativeElement.querySelector('mat-progress-bar')).not.toBeNull();

    const req = h.http.expectOne(isTrends);
    expect(req.request.params.get('months')).toBe('12');
    req.flush({
      asOf: '2026-11-09',
      points: [
        point('2026-10', {
          funerals: 2,
          funeralRevenue: 1000,
          duesBilled: 400,
          duesCollected: 100,
        }),
        point('2026-11', { funerals: 3, funeralRevenue: 500, duesBilled: 400, duesCollected: 300 }),
      ],
    });
    settle(fixture);

    const text = textOf(fixture);
    expect(text).toContain('5 en el período');
    expect(text).toContain('facturados');
    expect(text).toContain('50% cobrado en el período');
    for (const id of ['trend-services', 'trend-revenue', 'trend-dues']) {
      expect(
        fixture.nativeElement.querySelector(`[data-testid="${id}"] app-trend-chart`),
      ).not.toBeNull();
    }
  });

  it('says so when nothing was billed', () => {
    const fixture = setup();
    h.http.expectOne(isTrends).flush({ asOf: '2026-11-09', points: [point('2026-11')] });
    settle(fixture);
    expect(textOf(fixture)).toContain('Sin cuotas emitidas');
  });

  it('reloads when the window changes and retries after a failure', () => {
    const fixture = setup();
    h.http.expectOne(isTrends).flush(null, { status: 500, statusText: 'Error' });
    settle(fixture);
    expect(textOf(fixture)).toContain('No se pudieron cargar las tendencias.');

    (fixture.nativeElement.querySelector('.trends__retry') as HTMLButtonElement).click();
    settle(fixture);
    expect(h.http.expectOne(isTrends).request.params.get('months')).toBe('12');

    const toggles = Array.from(
      fixture.nativeElement.querySelectorAll('mat-button-toggle button'),
    ) as HTMLButtonElement[];
    toggles[2].click();
    settle(fixture);
    const req = h.http.expectOne(isTrends);
    expect(req.request.params.get('months')).toBe('24');
    req.flush({ asOf: '2026-11-09', points: [point('2026-11')] });
  });
});
