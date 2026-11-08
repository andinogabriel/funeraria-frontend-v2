import { affiliate } from '../../../../testing/fixtures';
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
import { AffiliateListPage } from './affiliate-list.page';

describe('AffiliateListPage', () => {
  let h: PageHarness;
  const ana = affiliate();
  const fixtures = [
    ['/affiliates/paginated', page([ana, affiliate({ dni: 40111223, firstName: 'Bruno' })])],
  ] as const;

  function setup(queryParams: Record<string, string> = {}) {
    h = configurePage({ queryParams });
    const fixture = render(AffiliateListPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('loads affiliates and renders them', () => {
    expect(textOf(setup())).toContain('Gomez');
  });

  it('forwards URL filters to the backend', () => {
    h = configurePage({
      queryParams: {
        firstName: 'Ana',
        lastName: 'Go',
        dni: '40',
        relationshipName: 'Madre',
        from: '1970-01-01',
        to: '1990-01-01',
        page: '1',
        size: '25',
        sortBy: 'lastName',
        sortDir: 'desc',
      },
    });
    const fixture = render(AffiliateListPage);
    const [req] = flushAll(h.http, fixtures);
    settle(fixture);
    expect(req.request.params.get('relationshipName')).toBe('Madre');
    expect(read(fixture, 'hasActiveFilters')).toBe(true);
  });

  it('pushes every column filter, sort, paging and clear to the URL', () => {
    const fixture = setup();
    const events: [string, unknown][] = [
      ['firstName', { type: 'text', value: 'Ana' }],
      ['lastName', { type: 'text', value: 'Go' }],
      ['dni', { type: 'text', value: '40' }],
      ['relationship', { type: 'autocomplete', value: 'Madre', label: 'Madre' }],
      ['birthDate', { type: 'dateRange', from: '1970-01-01', to: null }],
      ['birthDate', null],
      ['dni', null],
    ];
    for (const [key, filter] of events) {
      call(fixture, 'onColumnMenuApply', { key, filter, sortDirection: filter ? 'desc' : '' });
    }
    call(fixture, 'onPageChange', { pageIndex: 3, pageSize: 10 });
    call(fixture, 'onSortChange', { active: 'dni', direction: 'asc' });
    call(fixture, 'onSortChange', null);
    call(fixture, 'onClearFilters');
    expect(h.navigate).toHaveBeenCalledTimes(11);
  });

  it('refreshes, opens detail and edit', () => {
    const fixture = setup();
    call(fixture, 'onRefresh');
    flushAll(h.http, fixtures);
    const dialog = stubDialog();
    setSignal(fixture, 'selectedAffiliate', ana);
    call(fixture, 'onShowDetail');
    expect(dialog.open).toHaveBeenCalled();
    call(fixture, 'onEdit');
    expect(h.navigate).toHaveBeenCalled();
  });

  it('deletes after confirmation and restores the row when it fails', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedAffiliate', ana);
    call(fixture, 'onDelete');
    h.http.match((r) => r.method === 'DELETE')[0].flush(null);
    flushAll(h.http, fixtures);

    setSignal(fixture, 'selectedAffiliate', ana);
    call(fixture, 'onDelete');
    h.http
      .match((r) => r.method === 'DELETE')[0]
      .flush({ detail: 'tiene servicios' }, { status: 409, statusText: 'Conflict' });
    flushAll(h.http, fixtures);
    settle(fixture);
    expect(textOf(fixture)).toContain('Gomez');
  });
});
