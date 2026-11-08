import { income, supplier } from '../../../../testing/fixtures';
import {
  call,
  configurePage,
  flushAll,
  page,
  read,
  render,
  setSignal,
  settle,
  stubDialog,
  textOf,
  type PageHarness,
} from '../../../../testing/page-harness';
import { IncomeListPage } from './income-list.page';

describe('IncomeListPage', () => {
  let h: PageHarness;
  const active = income();
  const fixtures = [
    [
      '/incomes/paginated',
      page([active, income({ id: 11, receiptNumber: '9002', status: 'ANNULLED' })]),
    ],
    ['/suppliers', [supplier()]],
  ] as const;

  function setup(queryParams: Record<string, string> = {}) {
    h = configurePage({ queryParams });
    const fixture = render(IncomeListPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('loads incomes (ACTIVE by default) and renders them', () => {
    const fixture = setup();
    expect(textOf(fixture)).toContain('9001');
    expect(read(fixture, 'statusFilter')).toBe('ACTIVE');
  });

  it('forwards URL filters to the backend', () => {
    h = configurePage({
      queryParams: {
        status: 'ANNULLED',
        receiptNumber: '90',
        supplierNif: '30-1',
        from: '2026-11-01',
        to: '2026-11-30',
        page: '1',
        size: '25',
        sortBy: 'totalAmount',
        sortDir: 'asc',
      },
    });
    const fixture = render(IncomeListPage);
    const reqs = flushAll(h.http, fixtures);
    settle(fixture);
    const req = reqs.find((r) => r.request.url.includes('/incomes/paginated'))!;
    expect(req.request.params.get('supplierNif')).toBe('30-1');
    expect(req.request.params.get('from')).toBe('2026-11-01');
    expect(read(fixture, 'hasActiveFilters')).toBe(true);
  });

  it('pushes filters, sort, paging, status and clear to the URL', () => {
    const fixture = setup();
    call(fixture, 'onColumnMenuApply', {
      key: 'receiptNumber',
      filter: { type: 'text', value: '90' },
      sortDirection: 'desc',
    });
    call(fixture, 'onColumnMenuApply', {
      key: 'supplier',
      filter: { type: 'autocomplete', value: '30-1', label: 'Norte' },
      sortDirection: '',
    });
    call(fixture, 'onColumnMenuApply', {
      key: 'incomeDate',
      filter: { type: 'dateRange', from: '2026-11-01', to: null },
      sortDirection: 'asc',
    });
    call(fixture, 'onColumnMenuApply', { key: 'incomeDate', filter: null, sortDirection: '' });
    call(fixture, 'onPageChange', { pageIndex: 1, pageSize: 25 });
    call(fixture, 'onSortChange', { active: 'totalAmount', direction: 'desc' });
    call(fixture, 'onSortChange', null);
    call(fixture, 'onStatusChange', 'ANNULLED');
    call(fixture, 'onStatusChange', '');
    call(fixture, 'onClearFilters');
    expect(h.navigate).toHaveBeenCalledTimes(10);
  });

  it('refreshes, shows detail and navigates to edit', () => {
    const fixture = setup();
    call(fixture, 'onRefresh');
    flushAll(h.http, fixtures);
    const dialog = stubDialog();
    setSignal(fixture, 'selectedIncome', active);
    call(fixture, 'onShowDetail');
    expect(dialog.open).toHaveBeenCalled();
    call(fixture, 'onEdit');
    expect(h.navigate).toHaveBeenCalled();
  });

  it('annuls the selected income after confirmation', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedIncome', active);
    call(fixture, 'onAnnul');
    const writes = h.http.match((r) => r.method !== 'GET');
    expect(writes.length).toBe(1);
    writes[0].flush(income({ id: 12, reversalOfId: 10, totalAmount: -50000 }));
    flushAll(h.http, fixtures);
  });

  it('surfaces the backend reason when annul is rejected', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedIncome', active);
    call(fixture, 'onAnnul');
    h.http
      .match((r) => r.method !== 'GET')[0]
      .flush({ detail: 'Ya anulado' }, { status: 409, statusText: 'Conflict' });
    flushAll(h.http, fixtures);
  });

  it('does nothing when annul is dismissed', () => {
    const fixture = setup();
    stubDialog(false);
    setSignal(fixture, 'selectedIncome', active);
    call(fixture, 'onAnnul');
    expect(h.http.match((r) => r.method !== 'GET').length).toBe(0);
  });
});
