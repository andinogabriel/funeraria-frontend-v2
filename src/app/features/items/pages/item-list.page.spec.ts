import { item } from '../../../../testing/fixtures';
import {
  ADMIN,
  call,
  configurePage,
  flushAll,
  member,
  page,
  read,
  render,
  setSignal,
  stubDialog,
  settle,
  textOf,
  USER,
  type PageHarness,
} from '../../../../testing/page-harness';
import { ItemListPage } from './item-list.page';

describe('ItemListPage', () => {
  let h: PageHarness;

  const low = item({ id: 2, code: 'VEL-001', name: 'Vela', stock: 2, lowStockThreshold: 5 });
  const ok = item();

  function setup(queryParams: Record<string, string> = {}, authorities = ADMIN) {
    h = configurePage({ queryParams, authorities });
    const fixture = render(ItemListPage);
    flushAll(h.http, [['/items/paginated', page([ok, low])]]);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('loads the first page and renders the rows', () => {
    const fixture = setup();
    expect(textOf(fixture)).toContain('Cofre Standard');
    expect(textOf(fixture)).toContain('VEL-001');
  });

  it('forwards URL filters (including lowStock) to the backend', () => {
    h = configurePage({
      queryParams: {
        code: 'COF',
        name: 'Cofre',
        categoryName: 'Cofres',
        brandName: 'Akme',
        lowStock: 'true',
        page: '1',
        size: '25',
        sortBy: 'price',
        sortDir: 'desc',
      },
    });
    const fixture = render(ItemListPage);
    const [req] = flushAll(h.http, [['/items/paginated', page([low])]]);
    settle(fixture);
    const params = req.request.params;
    expect(params.get('lowStock')).toBe('true');
    expect(params.get('code')).toBe('COF');
    expect(params.get('page')).toBe('1');
    expect(params.get('sortDir')).toBe('desc');
    expect(textOf(fixture)).toContain('Mostrando solo items con stock');
    expect(read(fixture, 'hasActiveFilters')).toBe(true);
  });

  it('flags only rows at or below their threshold with the low-stock ring', () => {
    const fixture = setup();
    const fn = member<ItemListPage, (i: typeof ok) => string>(fixture, 'lowStockRowClass');
    expect(fn(low)).toContain('mat-sys-error');
    expect(fn(ok)).toBe('');
    expect(call(fixture, 'isStockBelowThreshold', item({ stock: null }))).toBe(false);
  });

  it('pushes column filter, sort, paging and clear-filter changes to the URL', () => {
    const fixture = setup();
    call(fixture, 'onColumnMenuApply', {
      key: 'code',
      filter: { type: 'text', value: 'COF' },
      sortDirection: 'asc',
    });
    call(fixture, 'onColumnMenuApply', { key: 'name', filter: null, sortDirection: '' });
    call(fixture, 'onColumnMenuApply', {
      key: 'category',
      filter: { type: 'autocomplete', value: 'Velas', label: 'Velas' },
      sortDirection: '',
    });
    call(fixture, 'onColumnMenuApply', {
      key: 'brand',
      filter: { type: 'autocomplete', value: 'Akme', label: 'Akme' },
      sortDirection: 'desc',
    });
    call(fixture, 'onPageChange', { pageIndex: 2, pageSize: 50 });
    call(fixture, 'onSortChange', { active: 'price', direction: 'asc' });
    call(fixture, 'onSortChange', null);
    call(fixture, 'onClearFilters');

    expect(h.navigate).toHaveBeenCalledTimes(8);
    const last = h.navigate.mock.calls.at(-1)![1] as { queryParams: Record<string, unknown> };
    expect(last.queryParams['lowStock']).toBeUndefined();
    expect(last.queryParams['page']).toBe('0');
  });

  it('refetches on URL change and on refresh', () => {
    const fixture = setup();
    h.setQueryParams({ name: 'Vela' });
    settle(fixture);
    const [byUrl] = flushAll(h.http, [['/items/paginated', page([low])]]);
    expect(byUrl.request.params.get('name')).toBe('Vela');

    call(fixture, 'onRefresh');
    expect(flushAll(h.http, [['/items/paginated', page([low])]]).length).toBe(1);
  });

  it('opens the detail dialog and navigates to edit for the selected row', () => {
    const fixture = setup();
    const dialog = stubDialog();
    setSignal(fixture, 'selectedItem', ok);
    call(fixture, 'onShowDetail');
    expect(dialog.open).toHaveBeenCalled();
    call(fixture, 'onEdit');
    expect(h.navigate).toHaveBeenCalledWith(['/items', 'COF-001', 'editar'], expect.anything());
  });

  it('deletes the selected item after confirmation and reloads', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedItem', ok);
    call(fixture, 'onDelete');
    const deletes = h.http.match((r) => r.method === 'DELETE');
    expect(deletes.length).toBe(1);
    deletes[0].flush(null);
    flushAll(h.http, [['/items/paginated', page([low])]]);
  });

  it('restores the row and reports the backend reason when delete is rejected', () => {
    const fixture = setup();
    stubDialog(true);
    setSignal(fixture, 'selectedItem', ok);
    call(fixture, 'onDelete');
    h.http
      .match((r) => r.method === 'DELETE')[0]
      .flush({ detail: 'El item tiene stock' }, { status: 409, statusText: 'Conflict' });
    flushAll(h.http, [['/items/paginated', page([ok, low])]]);
    settle(fixture);
    expect(textOf(fixture)).toContain('Cofre Standard');
  });

  it('hides admin-only actions for regular users', () => {
    const fixture = setup({}, USER);
    expect(read(fixture, 'isAdmin')).toBe(false);
    expect(textOf(fixture)).not.toContain('Papelera');
  });
});
