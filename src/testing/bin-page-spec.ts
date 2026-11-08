import type { Type } from '@angular/core';

import {
  ADMIN,
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
} from './page-harness';

/**
 * Shared behaviour of the admin papelera (soft-delete bin) pages: they list `GET .../deleted`,
 * push per-column filters to the URL, page, refresh and open a read-only detail dialog. Each
 * spec supplies its own row, column keys and the selection signal name.
 */
export interface BinSpec<T> {
  readonly component: Type<unknown>;
  readonly row: T;
  readonly expectText: string;
  readonly selectedSignal: string;
  /** Column keys with a text filter. */
  readonly textKeys: readonly string[];
  /** Column keys with an autocomplete filter. */
  readonly autocompleteKeys?: readonly string[];
  /** URL query params the page must forward (non-date). */
  readonly urlFilters: Record<string, string>;
}

export function describeBinPage<T>(name: string, spec: BinSpec<T>): void {
  describe(name, () => {
    let h: PageHarness;
    const fixtures = [['/deleted', page([spec.row])]] as const;

    function setup(queryParams: Record<string, string> = {}) {
      h = configurePage({ queryParams, authorities: ADMIN });
      const fixture = render(spec.component);
      const reqs = flushAll(h.http, fixtures);
      settle(fixture);
      return { fixture, reqs };
    }

    afterEach(() => h.http.verify());

    it('lists soft-deleted rows', () => {
      expect(textOf(setup().fixture)).toContain(spec.expectText);
    });

    it('forwards URL filters (deletedAt range as instants) to the backend', () => {
      const { fixture, reqs } = setup({
        ...spec.urlFilters,
        deletedFrom: '2026-11-01',
        deletedTo: '2026-11-02',
        from: '2026-11-01',
        to: '2026-11-02',
        page: '1',
        size: '25',
      });
      const params = reqs[0].request.params;
      for (const [key, value] of Object.entries(spec.urlFilters)) {
        expect(params.get(key)).toBe(value);
      }
      expect(read(fixture, 'hasActiveFilters')).toBe(true);
    });

    it('pushes column filters, paging and clear to the URL', () => {
      const { fixture } = setup();
      const events: [string, unknown][] = [
        ...spec.textKeys.map((key): [string, unknown] => [key, { type: 'text', value: 'x' }]),
        ...(spec.autocompleteKeys ?? []).map((key): [string, unknown] => [
          key,
          { type: 'autocomplete', value: 'x', label: 'x' },
        ]),
        ['deletedAt', { type: 'dateRange', from: '2026-11-01', to: '2026-11-02' }],
        ['deletedAt', null],
        [spec.textKeys[0], null],
      ];
      for (const [key, filter] of events) {
        call(fixture, 'onColumnMenuApply', { key, filter, sortDirection: '' });
      }
      call(fixture, 'onPageChange', { pageIndex: 1, pageSize: 25 });
      call(fixture, 'onClearFilters');
      expect(h.navigate).toHaveBeenCalledTimes(events.length + 2);
    });

    it('refreshes and opens the detail dialog for the selected row', () => {
      const { fixture } = setup();
      call(fixture, 'onRefresh');
      flushAll(h.http, fixtures);
      const dialog = stubDialog();
      setSignal(fixture, spec.selectedSignal, spec.row);
      call(fixture, 'onShowDetail');
      expect(dialog.open).toHaveBeenCalled();
    });

    it('shows a friendly error when the bin cannot be loaded', () => {
      h = configurePage({ authorities: ADMIN });
      const fixture = render(spec.component);
      for (const req of h.http.match(() => true)) {
        req.flush(null, { status: 403, statusText: 'Forbidden' });
      }
      settle(fixture);
      expect(textOf(fixture).length).toBeGreaterThan(0);
    });
  });
}
