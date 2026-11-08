import { funeral } from '../../../../testing/fixtures';
import {
  call,
  configurePage,
  flushAll,
  render,
  settle,
  textOf,
  USER,
  type PageHarness,
} from '../../../../testing/page-harness';
import { MyFuneralsPage } from './my-funerals.page';

describe('MyFuneralsPage', () => {
  let h: PageHarness;

  afterEach(() => h.http.verify());

  it('lists the services of the signed-in user and refreshes', () => {
    h = configurePage({ authorities: USER });
    const fixture = render(MyFuneralsPage);
    flushAll(h.http, [['/funerals/by-user', [funeral()]]]);
    settle(fixture);
    expect(textOf(fixture)).toContain('Perez');
    call(fixture, 'onRefresh');
    flushAll(h.http, [['/funerals/by-user', []]]);
    settle(fixture);
  });

  it('surfaces a load error', () => {
    h = configurePage({ authorities: USER });
    const fixture = render(MyFuneralsPage);
    for (const req of h.http.match(() => true)) {
      req.flush(null, { status: 500, statusText: 'Error' });
    }
    settle(fixture);
    expect(textOf(fixture).length).toBeGreaterThan(0);
  });
});
