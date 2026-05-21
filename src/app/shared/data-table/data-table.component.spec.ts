import { Component, ViewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DataTableComponent } from './data-table.component';
import type {
  DataTableColumn,
  DataTableColumnFilterValue,
  DataTableEmptyState,
  DataTableSort,
} from './data-table.types';
import { TablePreferencesService } from './table-preferences.service';

interface Row {
  readonly id: number;
  readonly name: string;
  readonly score: number | null;
}

/**
 * Host component used by tests so we can pass inputs through bindings instead of
 * poking the standalone component's signal inputs directly. Working through the
 * regular Angular API keeps the tests honest about the public contract callers use.
 */
@Component({
  imports: [DataTableComponent],
  template: `
    <app-data-table
      [data]="rows"
      [columns]="columns"
      [storageKey]="storageKey"
      [initialSort]="initialSort"
      [initialPageSize]="initialPageSize"
      [selectable]="selectable"
      [serverSide]="serverSide"
      [totalElements]="totalElements"
      [columnFilters]="columnFilters"
      [emptyState]="emptyState"
      (sortChange)="lastSortChange = $event"
      (pageChange)="lastPageChange = $event"
      (columnMenuApply)="lastColumnMenuApply = $event"
    />
  `,
})
class HostComponent {
  rows: readonly Row[] = [];
  columns: readonly DataTableColumn<Row>[] = [];
  storageKey: string | undefined = undefined;
  initialSort: DataTableSort | null = null;
  initialPageSize = 50;
  selectable = false;
  serverSide = false;
  totalElements = 0;
  columnFilters: ReadonlyMap<string, DataTableColumnFilterValue> = new Map();
  emptyState: DataTableEmptyState | null = null;
  lastSortChange: DataTableSort | null | undefined = undefined;
  lastPageChange: { pageIndex: number; pageSize: number } | undefined = undefined;
  lastColumnMenuApply:
    | {
        key: string;
        filter: DataTableColumnFilterValue | null;
        sortDirection: 'asc' | 'desc' | '';
      }
    | undefined = undefined;

  @ViewChild(DataTableComponent) table!: DataTableComponent<Row>;
}

describe('DataTableComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const columns: readonly DataTableColumn<Row>[] = [
    { key: 'id', label: 'ID', value: (r) => r.id, hideable: false },
    { key: 'name', label: 'Nombre', value: (r) => r.name, filter: 'text' },
    { key: 'score', label: 'Puntaje', value: (r) => r.score, defaultVisible: false },
  ];

  const rows: readonly Row[] = [
    { id: 1, name: 'Bravo', score: 30 },
    { id: 2, name: 'alfa', score: null },
    { id: 3, name: 'Carla', score: 10 },
  ];

  beforeEach(() => {
    // `provideNativeDateAdapter` is needed for the dateRange-filter test case to
    // boot the MatDatepicker inside the column menu. Bundling it in the global
    // TestBed config keeps every fixture date-aware without per-test wiring.
    TestBed.configureTestingModule({
      imports: [HostComponent, NoopAnimationsModule],
      providers: [provideNativeDateAdapter()],
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    host.rows = rows;
    host.columns = columns;
    fixture.detectChanges();
    window.localStorage.clear();
  });

  /**
   * Most tests need to drive protected APIs on the component. We type-erase here
   * once so each test stays focused on the intent.
   */
  function api() {
    return host.table as unknown as {
      onDraftToggle: (key: string, checked: boolean) => void;
      onApplyColumns: () => void;
      onResetColumns: () => void;
      onChooserOpen: () => void;
      applySort: (key: string, direction: 'asc' | 'desc' | '') => void;
    };
  }

  it('hydrates with the default visible columns (defaultVisible !== false)', () => {
    expect(host.table['visibleColumns']()).toEqual(['id', 'name']);
  });

  it('sorts ascending case-insensitively when the sort state targets a string column', () => {
    host.table['sortState'].set({ active: 'name', direction: 'asc' });
    fixture.detectChanges();

    expect(host.table['sortedData']().map((r) => r.name)).toEqual(['alfa', 'Bravo', 'Carla']);
  });

  it('flips order on descending and places null values last regardless of direction', () => {
    host.table['sortState'].set({ active: 'score', direction: 'asc' });
    fixture.detectChanges();
    expect(host.table['sortedData']().map((r) => r.score)).toEqual([10, 30, null]);

    host.table['sortState'].set({ active: 'score', direction: 'desc' });
    fixture.detectChanges();
    expect(host.table['sortedData']().map((r) => r.score)).toEqual([30, 10, null]);
  });

  it('commits the column chooser draft only when applied and preserves config order', () => {
    api().onChooserOpen();
    api().onDraftToggle('name', false);
    api().onDraftToggle('score', true);
    api().onApplyColumns();

    expect(host.table['visibleColumns']()).toEqual(['id', 'score']);
  });

  it('rejects an apply that would leave zero hideable columns visible', () => {
    api().onChooserOpen();
    api().onDraftToggle('name', false);
    api().onDraftToggle('score', false);
    api().onApplyColumns();

    expect(host.table['visibleColumns']()).toEqual(['id', 'name']);
  });

  it('persists preferences after apply when a storageKey is provided', () => {
    host.storageKey = 'spec.table';
    fixture.detectChanges();

    api().onChooserOpen();
    api().onDraftToggle('score', true);
    api().onApplyColumns();
    fixture.detectChanges();

    const stored = window.localStorage.getItem('fnr.table.spec.table');
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored!).visibleColumns).toEqual(['id', 'name', 'score']);
  });

  it('rehydrates a freshly-mounted table from previously persisted preferences', () => {
    const preferences = TestBed.inject(TablePreferencesService);
    preferences.save('spec.preload', {
      version: 1,
      visibleColumns: ['id', 'score'],
      sort: { active: 'score', direction: 'desc' },
      pageSize: 25,
    });

    const f = TestBed.createComponent(HostComponent);
    f.componentInstance.rows = rows;
    f.componentInstance.columns = columns;
    f.componentInstance.storageKey = 'spec.preload';
    f.detectChanges();

    expect(f.componentInstance.table['visibleColumns']()).toEqual(['id', 'score']);
    expect(f.componentInstance.table['sortState']()).toEqual({
      active: 'score',
      direction: 'desc',
    });
  });

  it('always pads the page with null placeholders up to the page size', () => {
    // Combined with the SCSS fixed-height viewport this gives a stable visual
    // footprint: 3 real rows + 2 placeholder rows fill the 5-row pageSize slot;
    // the viewport caps the total height at ~10 body rows regardless of pageSize.
    const f = TestBed.createComponent(HostComponent);
    f.componentInstance.rows = rows;
    f.componentInstance.columns = columns;
    f.componentInstance.initialPageSize = 5;
    f.detectChanges();

    const page = f.componentInstance.table['pagedData']();
    expect(page).toHaveLength(5);
    expect(page.slice(0, 3).every((r) => r !== null)).toBe(true);
    expect(page.slice(3).every((r) => r === null)).toBe(true);
  });

  it('returns a stable placeholder id from the internal trackBy for null rows', () => {
    const trackBy = host.table['effectiveTrackBy'];
    expect(trackBy(0, null)).toBe('__placeholder_0');
    expect(trackBy(7, null)).toBe('__placeholder_7');
    expect(trackBy(0, rows[0])).toBe(rows[0]); // identity default
  });

  it('resets defaults including sort and page size when the chooser reset is invoked', () => {
    host.initialSort = { active: 'name', direction: 'asc' };
    fixture.detectChanges();

    api().onChooserOpen();
    api().onDraftToggle('score', true);
    api().onDraftToggle('name', false);
    api().onApplyColumns();

    api().onResetColumns();

    expect(host.table['visibleColumns']()).toEqual(['id', 'name']);
    expect(host.table['sortState']()).toEqual({ active: 'name', direction: 'asc' });
  });

  it('selects a row on click when selectable is on and clears it on a second click', () => {
    host.selectable = true;
    fixture.detectChanges();

    const table = host.table as unknown as {
      selectedRow: () => Row | null;
      onRowClick: (row: Row | null) => void;
    };

    table.onRowClick(rows[0]);
    expect(table.selectedRow()).toBe(rows[0]);

    table.onRowClick(rows[0]);
    expect(table.selectedRow()).toBeNull();
  });

  it('ignores row clicks when selectable is off', () => {
    const table = host.table as unknown as {
      selectedRow: () => Row | null;
      onRowClick: (row: Row | null) => void;
    };

    table.onRowClick(rows[0]);
    expect(table.selectedRow()).toBeNull();
  });

  it('never selects a null placeholder row', () => {
    host.selectable = true;
    fixture.detectChanges();

    const table = host.table as unknown as {
      selectedRow: () => Row | null;
      onRowClick: (row: Row | null) => void;
    };

    table.onRowClick(null);
    expect(table.selectedRow()).toBeNull();
  });

  describe('column-menu sort (sort-only columns)', () => {
    function sortOnlyApi() {
      return host.table as unknown as {
        onStagedSortPick: (column: DataTableColumn<Row>, direction: 'asc' | 'desc' | '') => void;
        onColumnMenuSortOnlyApply: (column: DataTableColumn<Row>) => void;
      };
    }

    it('emits sortChange with the picked direction and resets to page 0', () => {
      const idColumn = columns.find((c) => c.key === 'id')!;
      sortOnlyApi().onStagedSortPick(idColumn, 'desc');
      sortOnlyApi().onColumnMenuSortOnlyApply(idColumn);

      expect(host.lastSortChange).toEqual({ active: 'id', direction: 'desc' });
      expect(host.table['sortState']()).toEqual({ active: 'id', direction: 'desc' });
      expect(host.table['pageIndex']()).toBe(0);
    });

    it('emits null and clears the sort state when direction is the empty string', () => {
      const idColumn = columns.find((c) => c.key === 'id')!;
      sortOnlyApi().onStagedSortPick(idColumn, 'asc');
      sortOnlyApi().onColumnMenuSortOnlyApply(idColumn);
      sortOnlyApi().onStagedSortPick(idColumn, '');
      sortOnlyApi().onColumnMenuSortOnlyApply(idColumn);

      expect(host.lastSortChange).toBeNull();
      expect(host.table['sortState']()).toBeNull();
    });

    it('emits a pageChange to page 0 in server-side mode so the parent re-fetches', () => {
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = rows;
      f.componentInstance.columns = columns;
      f.componentInstance.serverSide = true;
      f.componentInstance.totalElements = 50;
      f.componentInstance.initialPageSize = 10;
      f.detectChanges();

      const idColumn = columns.find((c) => c.key === 'id')!;
      const apiOf = f.componentInstance.table as unknown as {
        onStagedSortPick: (col: DataTableColumn<Row>, dir: 'asc' | 'desc' | '') => void;
        onColumnMenuSortOnlyApply: (col: DataTableColumn<Row>) => void;
      };
      apiOf.onStagedSortPick(idColumn, 'asc');
      apiOf.onColumnMenuSortOnlyApply(idColumn);

      expect(f.componentInstance.lastPageChange).toEqual({ pageIndex: 0, pageSize: 10 });
    });
  });

  describe('column-menu filters (staged + Aceptar)', () => {
    function menuApi() {
      return host.table as unknown as {
        onColumnMenuOpen: (col: DataTableColumn<Row>) => void;
        onColumnMenuApply: (col: DataTableColumn<Row>) => void;
        textControl: (key: string) => { setValue: (v: string) => void; value: string };
        dateControl: (
          key: string,
          end: 'from' | 'to',
        ) => { setValue: (v: Date | null) => void; value: Date | null };
      };
    }

    it('does NOT emit while the user types — only after Aceptar', () => {
      const nameColumn = columns.find((c) => c.key === 'name')!;
      menuApi().onColumnMenuOpen(nameColumn);
      menuApi().textControl('name').setValue('alf');

      expect(host.lastColumnMenuApply).toBeUndefined();

      menuApi().onColumnMenuApply(nameColumn);

      expect(host.lastColumnMenuApply).toEqual({
        key: 'name',
        filter: { type: 'text', value: 'alf' },
        sortDirection: '',
      });
    });

    it('emits null filter on Aceptar when the text input was cleared so the parent drops the URL param', () => {
      const nameColumn = columns.find((c) => c.key === 'name')!;
      host.columnFilters = new Map<string, DataTableColumnFilterValue>([
        ['name', { type: 'text', value: 'existing' }],
      ]);
      fixture.detectChanges();

      menuApi().onColumnMenuOpen(nameColumn);
      menuApi().textControl('name').setValue('');
      menuApi().onColumnMenuApply(nameColumn);

      expect(host.lastColumnMenuApply).toEqual({
        key: 'name',
        filter: null,
        sortDirection: '',
      });
    });

    it('trims whitespace before emitting on Aceptar so leading spaces do not pollute the URL', () => {
      const nameColumn = columns.find((c) => c.key === 'name')!;
      menuApi().onColumnMenuOpen(nameColumn);
      menuApi().textControl('name').setValue('   ');
      menuApi().onColumnMenuApply(nameColumn);

      expect(host.lastColumnMenuApply).toEqual({
        key: 'name',
        filter: null,
        sortDirection: '',
      });
    });

    it('emits a combined dateRange + sort payload on Aceptar', () => {
      const dateColumns: readonly DataTableColumn<Row>[] = [
        ...columns,
        { key: 'when', label: 'Cuándo', value: () => null, filter: 'dateRange' },
      ];
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = rows;
      f.componentInstance.columns = dateColumns;
      f.detectChanges();

      const whenColumn = dateColumns.find((c) => c.key === 'when')!;
      const fApi = f.componentInstance.table as unknown as {
        onColumnMenuOpen: (col: DataTableColumn<Row>) => void;
        onColumnMenuApply: (col: DataTableColumn<Row>) => void;
        dateControl: (key: string, end: 'from' | 'to') => { setValue: (v: Date | null) => void };
      };
      fApi.onColumnMenuOpen(whenColumn);
      fApi.dateControl('when', 'from').setValue(new Date(2026, 0, 5));
      fApi.onColumnMenuApply(whenColumn);

      expect(f.componentInstance.lastColumnMenuApply).toEqual({
        key: 'when',
        filter: { type: 'dateRange', from: '2026-01-05', to: null },
        sortDirection: '',
      });
    });

    it('seeds the menu input from columnFilters when the menu opens (URL → menu sync)', () => {
      host.columnFilters = new Map<string, DataTableColumnFilterValue>([
        ['name', { type: 'text', value: 'preloaded' }],
      ]);
      fixture.detectChanges();

      const nameColumn = columns.find((c) => c.key === 'name')!;
      menuApi().onColumnMenuOpen(nameColumn);

      expect(menuApi().textControl('name').value).toBe('preloaded');
    });

    it('reports an active filter through hasActiveFilter when the column carries a value', () => {
      host.columnFilters = new Map<string, DataTableColumnFilterValue>([
        ['name', { type: 'text', value: 'x' }],
      ]);
      fixture.detectChanges();

      const apiOf = host.table as unknown as { hasActiveFilter: (key: string) => boolean };
      expect(apiOf.hasActiveFilter('name')).toBe(true);
      expect(apiOf.hasActiveFilter('id')).toBe(false);
    });

    it('emits filter + sort together on Aceptar in a single atomic payload', () => {
      const nameColumn = columns.find((c) => c.key === 'name')!;
      menuApi().onColumnMenuOpen(nameColumn);
      menuApi().textControl('name').setValue('xyz');

      const apiOf = host.table as unknown as {
        onStagedSortPick: (col: DataTableColumn<Row>, dir: 'asc' | 'desc' | '') => void;
      };
      apiOf.onStagedSortPick(nameColumn, 'desc');

      menuApi().onColumnMenuApply(nameColumn);

      // Both pieces of staged state ride one event so the parent updates the URL atomically.
      expect(host.lastColumnMenuApply).toEqual({
        key: 'name',
        filter: { type: 'text', value: 'xyz' },
        sortDirection: 'desc',
      });
    });

    it('emits sortDirection on Aceptar even when the filter value has not changed', () => {
      // Regression: previously the data-table emitted filter + sort as two events
      // and back-to-back router.navigate() calls raced — when the filter value
      // did not change between menu opens but the sort did, the sort change got
      // dropped because the second navigate read a snapshot before the first
      // committed. The combined event eliminates the race by definition.
      host.columnFilters = new Map<string, DataTableColumnFilterValue>([
        ['name', { type: 'text', value: 'stable' }],
      ]);
      host.initialSort = { active: 'name', direction: 'asc' };
      fixture.detectChanges();

      const nameColumn = columns.find((c) => c.key === 'name')!;
      menuApi().onColumnMenuOpen(nameColumn);
      // Filter value untouched; only flip the sort.
      const apiOf = host.table as unknown as {
        onStagedSortPick: (col: DataTableColumn<Row>, dir: 'asc' | 'desc' | '') => void;
      };
      apiOf.onStagedSortPick(nameColumn, 'desc');
      menuApi().onColumnMenuApply(nameColumn);

      expect(host.lastColumnMenuApply).toEqual({
        key: 'name',
        filter: { type: 'text', value: 'stable' },
        sortDirection: 'desc',
      });
    });
  });

  describe('column-menu autocomplete', () => {
    interface NamedRow extends Row {
      readonly tag: string | null;
    }

    function withAutocomplete() {
      const supplierColumn: DataTableColumn<NamedRow> = {
        key: 'tag',
        label: 'Tag',
        value: (r) => r.tag,
        filter: 'autocomplete',
        sortable: false,
        autocomplete: {
          options: () => [
            { value: 'a', label: 'Alpha' },
            { value: 'b', label: 'Beta' },
            { value: 'c', label: 'Carla' },
          ],
          minSearchChars: 3,
        },
      };
      return supplierColumn;
    }

    it('hides options until the search input crosses minSearchChars', () => {
      const col = withAutocomplete();
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = [];
      f.componentInstance.columns = [col as unknown as DataTableColumn<Row>];
      f.detectChanges();

      const t = f.componentInstance.table as unknown as {
        onColumnMenuOpen: (col: DataTableColumn<Row>) => void;
        onAutocompleteSearchInput: (col: DataTableColumn<Row>, raw: string) => void;
        filteredAutocompleteOptions: (col: DataTableColumn<Row>) => readonly unknown[];
      };
      t.onColumnMenuOpen(col as unknown as DataTableColumn<Row>);

      t.onAutocompleteSearchInput(col as unknown as DataTableColumn<Row>, 'al');
      expect(t.filteredAutocompleteOptions(col as unknown as DataTableColumn<Row>)).toHaveLength(0);

      t.onAutocompleteSearchInput(col as unknown as DataTableColumn<Row>, 'alp');
      expect(t.filteredAutocompleteOptions(col as unknown as DataTableColumn<Row>)).toHaveLength(1);
    });

    it('emits the picked option`s value on Aceptar (typing alone does nothing)', () => {
      const col = withAutocomplete();
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = [];
      f.componentInstance.columns = [col as unknown as DataTableColumn<Row>];
      f.detectChanges();

      const t = f.componentInstance.table as unknown as {
        onColumnMenuOpen: (col: DataTableColumn<Row>) => void;
        onAutocompleteSearchInput: (col: DataTableColumn<Row>, raw: string) => void;
        onAutocompleteOptionSelect: (
          col: DataTableColumn<Row>,
          option: { value: string; label: string },
        ) => void;
        onColumnMenuApply: (col: DataTableColumn<Row>) => void;
      };
      t.onColumnMenuOpen(col as unknown as DataTableColumn<Row>);
      t.onAutocompleteSearchInput(col as unknown as DataTableColumn<Row>, 'alp');

      // Without a pick, Aceptar commits null (typing alone is not a selection).
      t.onColumnMenuApply(col as unknown as DataTableColumn<Row>);
      expect(f.componentInstance.lastColumnMenuApply).toEqual({
        key: 'tag',
        filter: null,
        sortDirection: '',
      });

      // After selecting an option, Aceptar commits the option's value + label.
      t.onAutocompleteOptionSelect(col as unknown as DataTableColumn<Row>, {
        value: 'a',
        label: 'Alpha',
      });
      t.onColumnMenuApply(col as unknown as DataTableColumn<Row>);
      expect(f.componentInstance.lastColumnMenuApply).toEqual({
        key: 'tag',
        filter: { type: 'autocomplete', value: 'a', label: 'Alpha' },
        sortDirection: '',
      });
    });
  });

  describe('empty state', () => {
    it('flips showEmptyState when data is empty AND an emptyState config is supplied', () => {
      host.rows = [];
      host.emptyState = { icon: 'inbox', title: 'No data', body: 'Try again' };
      fixture.detectChanges();

      expect(host.table['showEmptyState']()).toBe(true);
    });

    it('stays hidden when data is empty but no emptyState config is provided', () => {
      host.rows = [];
      fixture.detectChanges();

      expect(host.table['showEmptyState']()).toBe(false);
    });

    it('keys server-side mode off totalElements, not the local data length', () => {
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = [];
      f.componentInstance.columns = columns;
      f.componentInstance.serverSide = true;
      f.componentInstance.totalElements = 0;
      f.componentInstance.emptyState = { icon: 'inbox', title: 'Nada' };
      f.detectChanges();

      expect(f.componentInstance.table['showEmptyState']()).toBe(true);
    });
  });

  describe('server-side mode', () => {
    it('renders data as-is without applying internal sort', () => {
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = rows;
      f.componentInstance.columns = columns;
      f.componentInstance.serverSide = true;
      f.componentInstance.totalElements = 42;
      f.detectChanges();

      const table = f.componentInstance.table as unknown as {
        sortState: { set: (s: { active: string; direction: 'asc' | 'desc' | '' }) => void };
        sortedData: () => readonly Row[];
      };

      table.sortState.set({ active: 'name', direction: 'asc' });
      f.detectChanges();

      expect(table.sortedData()).toEqual(rows);
    });

    it('does not slice data into pages — the parent owns the page', () => {
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = rows;
      f.componentInstance.columns = columns;
      f.componentInstance.serverSide = true;
      f.componentInstance.totalElements = 100;
      f.componentInstance.initialPageSize = 10;
      f.detectChanges();

      const table = f.componentInstance.table as unknown as {
        pagedData: () => readonly (Row | null)[];
      };

      // 10 page size, 3 rows → padded to 10. The 3 real rows survive untouched.
      const page = table.pagedData();
      expect(page.slice(0, 3)).toEqual(rows);
    });

    it('uses totalElements for paginatorLength instead of data.length', () => {
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = rows;
      f.componentInstance.columns = columns;
      f.componentInstance.serverSide = true;
      f.componentInstance.totalElements = 248;
      f.detectChanges();

      const table = f.componentInstance.table as unknown as { paginatorLength: () => number };
      expect(table.paginatorLength()).toBe(248);
    });
  });

  it('still applies internal sort in client-side mode (default)', () => {
    host.table['sortState'].set({ active: 'name', direction: 'asc' });
    fixture.detectChanges();

    expect(host.table['sortedData']().map((r) => r.name)).toEqual(['alfa', 'Bravo', 'Carla']);
  });
});
