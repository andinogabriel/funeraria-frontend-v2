import { supplier } from '../../../../testing/fixtures';
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
  type PageHarness,
} from '../../../../testing/page-harness';
import { SupplierListPage } from './supplier-list.page';

describe('SupplierListPage', () => {
  let h: PageHarness;
  const norte = supplier();
  const fixtures = [['/suppliers', [norte, supplier({ name: 'Sur', nif: '30-2' })]]] as const;

  function setup() {
    h = configurePage();
    const fixture = render(SupplierListPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('loads and renders suppliers', () => {
    expect(textOf(setup())).toContain('Proveedora Norte');
  });

  it('runs every action on the selected supplier and refreshes', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedSupplier', norte);
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
    setSignal(fixture, 'selectedSupplier', norte);
    runActions(fixture, ['delete']);
    for (const req of h.http.match((r) => r.method === 'DELETE')) {
      req.flush({ detail: 'en uso' }, { status: 409, statusText: 'Conflict' });
    }
    settle(fixture);
  });
});
