import { auditEvent } from '../../../../testing/fixtures';
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
import { AuditEventListPage } from './audit-event-list.page';

describe('AuditEventListPage', () => {
  let h: PageHarness;
  const ev = auditEvent();
  const fixtures = [['/audit-events', page([ev])]] as const;

  function setup(queryParams: Record<string, string> = {}) {
    h = configurePage({ queryParams });
    const fixture = render(AuditEventListPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('loads events and renders them', () => {
    expect(textOf(setup())).toContain('admin@funeraria.local');
  });

  it('converts date filters to Argentina-anchored instants', () => {
    h = configurePage({
      queryParams: {
        actorEmail: 'admin',
        action: 'FUNERAL_CREATED',
        targetType: 'FUNERAL',
        targetId: '5',
        from: '2026-11-01',
        to: '2026-11-02',
        page: '1',
        size: '25',
      },
    });
    const fixture = render(AuditEventListPage);
    const [req] = flushAll(h.http, fixtures);
    settle(fixture);
    expect(req.request.params.get('from')).toBe('2026-11-01T03:00:00.000Z');
    expect(req.request.params.get('to')).toBe('2026-11-03T02:59:59.999Z');
    expect(read(fixture, 'hasActiveFilters')).toBe(true);
  });

  it('pushes every column filter, paging and clear to the URL', () => {
    const fixture = setup();
    const events: [string, unknown][] = [
      ['actorEmail', { type: 'text', value: 'admin' }],
      ['action', { type: 'autocomplete', value: 'FUNERAL_CREATED', label: 'x' }],
      ['targetType', { type: 'text', value: 'FUNERAL' }],
      ['targetId', { type: 'text', value: '5' }],
      ['occurredAt', { type: 'dateRange', from: '2026-11-01', to: '2026-11-02' }],
      ['occurredAt', null],
    ];
    for (const [key, filter] of events) {
      call(fixture, 'onColumnMenuApply', { key, filter, sortDirection: '' });
    }
    call(fixture, 'onPageChange', { pageIndex: 1, pageSize: 25 });
    call(fixture, 'onClearFilters');
    expect(h.navigate).toHaveBeenCalledTimes(8);
  });

  it('refreshes and opens the detail dialog', () => {
    const fixture = setup();
    call(fixture, 'onRefresh');
    flushAll(h.http, fixtures);
    const dialog = stubDialog();
    setSignal(fixture, 'selectedEvent', ev);
    call(fixture, 'onShowDetail');
    expect(dialog.open).toHaveBeenCalled();
  });
});
