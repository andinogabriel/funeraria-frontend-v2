import { funeral } from '../../../../testing/fixtures';
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
import { FuneralListPage } from './funeral-list.page';

describe('FuneralListPage', () => {
  let h: PageHarness;
  const one = funeral();
  const fixtures = [
    ['/funerals/paginated', page([one, funeral({ id: 6, receiptNumber: 'F-1002' })])],
  ] as const;

  function setup(queryParams: Record<string, string> = {}) {
    h = configurePage({ queryParams });
    const fixture = render(FuneralListPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('loads services and renders them', () => {
    expect(textOf(setup())).toContain('F-1001');
  });

  it('forwards URL filters to the backend', () => {
    h = configurePage({
      queryParams: {
        deceasedName: 'Juan',
        dni: '30',
        receiptNumber: 'F',
        planName: 'Plan Standard',
        from: '2026-11-01',
        to: '2026-11-30',
        page: '2',
        size: '50',
        sortBy: 'funeralDate',
        sortDir: 'desc',
      },
    });
    const fixture = render(FuneralListPage);
    const [req] = flushAll(h.http, fixtures);
    settle(fixture);
    expect(req.request.params.get('deceasedName')).toBe('Juan');
    expect(req.request.params.get('planName')).toBe('Plan Standard');
    expect(read(fixture, 'hasActiveFilters')).toBe(true);
  });

  it('pushes every column filter, sort, paging and clear to the URL', () => {
    const fixture = setup();
    const events: [string, unknown][] = [
      ['deceasedName', { type: 'text', value: 'Juan' }],
      ['dni', { type: 'text', value: '30' }],
      ['receiptNumber', { type: 'text', value: 'F' }],
      ['plan', { type: 'autocomplete', value: 'Plan Standard', label: 'Plan Standard' }],
      ['funeralDate', { type: 'dateRange', from: '2026-11-01', to: '2026-11-30' }],
      ['funeralDate', null],
      ['dni', null],
    ];
    for (const [key, filter] of events) {
      call(fixture, 'onColumnMenuApply', { key, filter, sortDirection: filter ? 'asc' : '' });
    }
    call(fixture, 'onPageChange', { pageIndex: 1, pageSize: 25 });
    call(fixture, 'onSortChange', { active: 'totalAmount', direction: 'desc' });
    call(fixture, 'onSortChange', null);
    call(fixture, 'onClearFilters');
    expect(h.navigate).toHaveBeenCalledTimes(11);
  });

  it('refreshes, opens detail and edit for the selected service', () => {
    const fixture = setup();
    call(fixture, 'onRefresh');
    flushAll(h.http, fixtures);
    setSignal(fixture, 'selectedFuneral', one);
    call(fixture, 'onShowDetail');
    call(fixture, 'onEdit');
    expect(h.navigate).toHaveBeenCalledTimes(2);
  });

  it('deletes after confirmation and restores the row when it fails', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedFuneral', one);
    call(fixture, 'onDelete');
    h.http.match((r) => r.method === 'DELETE')[0].flush(null);
    flushAll(h.http, fixtures);

    setSignal(fixture, 'selectedFuneral', one);
    call(fixture, 'onDelete');
    h.http
      .match((r) => r.method === 'DELETE')[0]
      .flush({ detail: 'no' }, { status: 500, statusText: 'Error' });
    flushAll(h.http, fixtures);
    settle(fixture);
    expect(textOf(fixture)).toContain('F-1001');
  });
});
