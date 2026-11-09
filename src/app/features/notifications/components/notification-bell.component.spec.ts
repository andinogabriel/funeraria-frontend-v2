import type { MatMenuTrigger } from '@angular/material/menu';

import { lowStockNotification } from '../../../../testing/fixtures';
import {
  call,
  configurePage,
  read,
  render,
  type PageHarness,
} from '../../../../testing/page-harness';
import { NotificationBellComponent } from './notification-bell.component';

describe('NotificationBellComponent', () => {
  let h: PageHarness;
  const trigger = { closeMenu: vi.fn() } as unknown as MatMenuTrigger;
  const page = (content: unknown[]) => ({ content, totalElements: content.length });
  const isList = (r: { url: string; method: string }) =>
    r.method === 'GET' && r.url.endsWith('/notifications');

  function setup() {
    h = configurePage();
    return render(NotificationBellComponent);
  }

  afterEach(() => h.http.verify());

  it('loads the recent unread notifications when the menu opens', () => {
    const fixture = setup();
    call(fixture, 'onMenuOpened');
    expect(read(fixture, 'loading')).toBe(true);
    const req = h.http.expectOne(isList);
    expect(req.request.params.get('onlyUnread')).toBe('true');
    req.flush(page([lowStockNotification()]));
    expect(read(fixture, 'loading')).toBe(false);
    expect((read(fixture, 'recent') as unknown[]).length).toBe(1);
  });

  it('stops loading when the recent list fails', () => {
    const fixture = setup();
    call(fixture, 'onMenuOpened');
    h.http.expectOne(isList).flush(null, { status: 500, statusText: 'Error' });
    expect(read(fixture, 'loading')).toBe(false);
  });

  it('marks a low-stock alert as read and opens the items list on its code', () => {
    const fixture = setup();
    call(fixture, 'onSelect', lowStockNotification(), trigger);
    expect(trigger.closeMenu).toHaveBeenCalled();
    h.http
      .expectOne((r) => r.url.endsWith('/notifications/1/read'))
      .flush(null, { status: 500, statusText: 'Error' });
    expect(h.navigate).toHaveBeenCalledWith(['/items'], { queryParams: { code: 'VEL-1' } });
  });

  it('does not navigate for an unknown notification type', () => {
    const fixture = setup();
    call(fixture, 'onSelect', lowStockNotification({ type: 'OTHER' as never }), trigger);
    h.http.expectOne((r) => r.url.endsWith('/notifications/1/read')).flush(lowStockNotification());
    expect(h.navigate).not.toHaveBeenCalled();
    expect(call(fixture, 'typeLabel', 'OTHER')).toBe('OTHER');
    expect(call(fixture, 'typeLabel', 'LOW_STOCK_REACHED')).toBe('Stock bajo');
  });

  it('marks everything as read, with or without pending alerts, and survives a failure', () => {
    const fixture = setup();
    const readAll = (r: { url: string }) => r.url.endsWith('/notifications/read-all');

    call(fixture, 'onMarkAllRead', trigger);
    h.http.expectOne(readAll).flush({ affected: 3 });
    expect(read(fixture, 'recent')).toEqual([]);

    call(fixture, 'onMarkAllRead', trigger);
    h.http.expectOne(readAll).flush({ affected: 0 });

    call(fixture, 'onMarkAllRead', trigger);
    h.http.expectOne(readAll).flush(null, { status: 500, statusText: 'Error' });
  });
});
