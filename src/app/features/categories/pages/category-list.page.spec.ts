import { category } from '../../../../testing/fixtures';
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
import { CategoryListPage } from './category-list.page';

describe('CategoryListPage', () => {
  let h: PageHarness;
  const cofres = category();
  const fixtures = [['/categories', [cofres, category({ id: 2, name: 'Velas' })]]] as const;

  function setup() {
    h = configurePage();
    const fixture = render(CategoryListPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('loads and renders categories', () => {
    expect(textOf(setup())).toContain('Velas');
  });

  it('edits and deletes the selected category, and refreshes', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedCategory', cofres);
    runActions(fixture);
    expect(h.navigate).toHaveBeenCalled();
    h.http.match((r) => r.method === 'DELETE')[0].flush(null);
    call(fixture, 'onRefresh');
    flushAll(h.http, fixtures);
  });

  it('reports a rejected delete', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedCategory', cofres);
    runActions(fixture, ['delete']);
    h.http
      .match((r) => r.method === 'DELETE')[0]
      .flush({ detail: 'en uso' }, { status: 409, statusText: 'Conflict' });
    settle(fixture);
  });
});
