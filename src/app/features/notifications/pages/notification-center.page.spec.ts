import { lowStockNotification } from '../../../../testing/fixtures';
import {
  call,
  configurePage,
  flushAll,
  page,
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
});
