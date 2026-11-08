import { brand } from '../../../../testing/fixtures';
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
import { BrandListPage } from './brand-list.page';

describe('BrandListPage', () => {
  let h: PageHarness;
  const akme = brand();
  const fixtures = [['/brands', [akme, brand({ id: 2, name: 'Roble' })]]] as const;

  function setup() {
    h = configurePage();
    const fixture = render(BrandListPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('loads and renders brands', () => {
    expect(textOf(setup())).toContain('Roble');
  });

  it('edits and deletes the selected brand, and refreshes', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedBrand', akme);
    runActions(fixture);
    expect(h.navigate).toHaveBeenCalled();
    h.http.match((r) => r.method === 'DELETE')[0].flush(null);
    call(fixture, 'onRefresh');
    flushAll(h.http, fixtures);
  });

  it('reports a rejected delete', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedBrand', akme);
    runActions(fixture, ['delete']);
    h.http
      .match((r) => r.method === 'DELETE')[0]
      .flush({ detail: 'en uso' }, { status: 409, statusText: 'Conflict' });
    settle(fixture);
  });
});
