import { plan } from '../../../../testing/fixtures';
import {
  call,
  configurePage,
  flushAll,
  render,
  runActions,
  setSignal,
  settle,
  stubDialog,
  textOf,
  USER,
  type PageHarness,
} from '../../../../testing/page-harness';
import { PlanListPage } from './plan-list.page';

describe('PlanListPage', () => {
  let h: PageHarness;
  const standard = plan();
  const fixtures = [['/plans', [standard, plan({ id: 4, name: 'Plan Premium' })]]] as const;

  function setup(authorities?: readonly string[]) {
    h = configurePage({ authorities });
    const fixture = render(PlanListPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('loads and renders plans', () => {
    expect(textOf(setup())).toContain('Plan Premium');
  });

  it('runs every action on the selected plan and refreshes', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedPlan', standard);
    runActions(fixture);
    for (const req of h.http.match((r) => r.method === 'DELETE')) {
      req.flush(null);
    }
    call(fixture, 'onRefresh');
    flushAll(h.http, fixtures);
  });

  it('reports a rejected delete', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedPlan', standard);
    runActions(fixture, ['delete']);
    for (const req of h.http.match((r) => r.method === 'DELETE')) {
      req.flush({ detail: 'usado' }, { status: 409, statusText: 'Conflict' });
    }
    settle(fixture);
  });

  it('renders for a regular user', () => {
    expect(textOf(setup(USER))).toContain('Plan Standard');
  });
});
