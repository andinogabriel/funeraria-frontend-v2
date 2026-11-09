import { lowStockNotification } from '../../../../testing/fixtures';
import {
  call,
  configurePage,
  flushAll,
  page,
  read,
  render,
  setSignal,
  settle,
  textOf,
  type PageHarness,
} from '../../../../testing/page-harness';
import { NotificationCenterPage } from './notification-center.page';

describe('NotificationCenterPage', () => {
  let h: PageHarness;
  const unread = lowStockNotification();
  const fixtures = [
    ['/unread-count', { count: 1 }],
    ['/read-all', { affected: 1 }],
    [/\/notifications\/\d+\/read/, lowStockNotification({ readAt: '2026-11-08T13:00:00Z' })],
    [
      '/notifications',
      page([unread, lowStockNotification({ id: 2, readAt: '2026-11-08T13:00:00Z' })]),
    ],
  ] as const;

  function setup(queryParams: Record<string, string> = {}) {
    h = configurePage({ queryParams });
    const fixture = render(NotificationCenterPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('lists notifications with a readable low-stock message', () => {
    const fixture = setup();
    expect(textOf(fixture)).toContain('Vela');
    expect(call(fixture, 'typeLabel', 'LOW_STOCK_REACHED')).toBeTruthy();
    expect(call(fixture, 'lowStockPayload', unread)).toMatchObject({ code: 'VEL-1' });
  });

  it('reloads when the filter or the page changes', () => {
    const fixture = setup();
    call(fixture, 'onFilterChange', 'unread');
    const [unreadReq] = flushAll(h.http, fixtures);
    expect(unreadReq.request.params.get('onlyUnread')).toBe('true');
    call(fixture, 'onPageChange', { pageIndex: 1, pageSize: 25 });
    const [pageReq] = flushAll(h.http, fixtures);
    expect(pageReq.request.params.get('page')).toBe('1');
    call(fixture, 'onFilterChange', 'all');
    flushAll(h.http, fixtures);
  });

  it('marks the selected notification and all as read, and opens the item', () => {
    const fixture = setup();
    setSignal(fixture, 'selectedNotification', unread);
    call(fixture, 'onMarkSelectedRead');
    flushAll(h.http, fixtures);
    call(fixture, 'onMarkAllRead');
    flushAll(h.http, fixtures);
    setSignal(fixture, 'selectedNotification', unread);
    call(fixture, 'onOpenSelected');
    flushAll(h.http, fixtures);
    settle(fixture);
  });

  it('renders empty item and stock cells for other notification types', () => {
    const fixture = setup();
    const other = lowStockNotification({ type: 'OTHER' as never });
    const columns = read(fixture, 'columns') as { key: string; value: (n: unknown) => string }[];
    expect(columns.find((c) => c.key === 'item')?.value(other)).toBe('');
    expect(columns.find((c) => c.key === 'stock')?.value(other)).toBe('');
    expect(columns.find((c) => c.key === 'stock')?.value(unread)).toBe('6 -> 4');
    expect(call(fixture, 'typeLabel', 'OTHER')).toBe('OTHER');
  });

  it('ignores the row actions without a selection or for a read notification', () => {
    const fixture = setup();
    call(fixture, 'onMarkSelectedRead');
    call(fixture, 'onOpenSelected');
    setSignal(
      fixture,
      'selectedNotification',
      lowStockNotification({ readAt: '2026-11-08T13:00:00Z' }),
    );
    call(fixture, 'onMarkSelectedRead');
    h.http.expectNone((r) => r.url.includes('/read'));
    call(fixture, 'onOpenSelected');
    h.http.expectNone((r) => r.url.includes('/read'));
    expect(h.navigate).toHaveBeenCalledWith(['/items'], { queryParams: { code: 'VEL-1' } });
  });

  it('survives failed read marks and reports when nothing was pending', () => {
    const fixture = setup();
    const fail = (r: { url: string }) => r.url.includes('/read');
    setSignal(fixture, 'selectedNotification', unread);
    call(fixture, 'onMarkSelectedRead');
    h.http.expectOne(fail).flush(null, { status: 500, statusText: 'Error' });
    call(fixture, 'onOpenSelected');
    h.http.expectOne(fail).flush(null, { status: 500, statusText: 'Error' });
    call(fixture, 'onMarkAllRead');
    h.http.expectOne(fail).flush(null, { status: 500, statusText: 'Error' });

    setSignal(fixture, 'selectedNotification', lowStockNotification({ type: 'OTHER' as never }));
    call(fixture, 'onOpenSelected');
    h.http.expectOne(fail).flush(lowStockNotification());

    call(fixture, 'onMarkAllRead');
    h.http.expectOne((r) => r.url.endsWith('/read-all')).flush({ affected: 0 });
    flushAll(h.http, fixtures);
  });
});
