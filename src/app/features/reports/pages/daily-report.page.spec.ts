import { income } from '../../../../testing/fixtures';
import {
  call,
  configurePage,
  flushAll,
  render,
  settle,
  stubDialog,
  textOf,
  type PageHarness,
} from '../../../../testing/page-harness';
import type { DailyReport } from '../report.types';
import { DailyReportPage } from './daily-report.page';

const report: DailyReport = {
  date: '2026-11-08',
  services: {
    count: 1,
    total: 900000,
    lines: [
      {
        funeralId: 5,
        receiptNumber: 'F-1001',
        deceasedName: 'Juan Perez',
        planName: 'Plan Standard',
        amount: 900000,
      },
    ],
  },
  purchases: {
    count: 1,
    total: 50000,
    annulledCount: 1,
    lines: [
      {
        receiptNumber: '9001',
        supplierName: 'Norte',
        amount: 50000,
        status: 'ACTIVE',
        reversal: false,
      },
      {
        receiptNumber: '9002',
        supplierName: null,
        amount: -10000,
        status: 'ACTIVE',
        reversal: true,
      },
    ],
  },
  net: 850000,
};

describe('DailyReportPage', () => {
  let h: PageHarness;

  function setup() {
    h = configurePage();
    const fixture = render(DailyReportPage);
    flushAll(h.http, [['/reports/daily', report]]);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('renders services, purchases and the net', () => {
    const text = textOf(setup());
    expect(text).toContain('Juan Perez');
    expect(text).toContain('Norte');
  });

  it('opens the service detail and the income dialog', () => {
    const fixture = setup();
    call(fixture, 'openService', report.services.lines[0]);
    expect(h.navigate).toHaveBeenCalledWith(['/servicios', 5]);
    const dialog = stubDialog();
    call(fixture, 'openPurchase', report.purchases.lines[0]);
    flushAll(h.http, [['/incomes/9001', income()]]);
    expect(dialog.open).toHaveBeenCalled();
  });

  it('reports a failed income lookup and reloads on demand', () => {
    const fixture = setup();
    call(fixture, 'openPurchase', report.purchases.lines[0]);
    h.http
      .match((r) => r.url.includes('/incomes/'))
      .forEach((r) => r.flush(null, { status: 404, statusText: 'Not Found' }));
    call(fixture, 'load');
    for (const req of h.http.match(() => true)) {
      req.flush(null, { status: 403, statusText: 'Forbidden' });
    }
    settle(fixture);
  });
});
