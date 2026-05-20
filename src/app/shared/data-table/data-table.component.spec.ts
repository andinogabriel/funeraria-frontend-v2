import { Component, ViewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideNativeDateAdapter } from '@angular/material/core';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { afterEach, vi } from 'vitest';

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
      (columnFilterChange)="lastColumnFilterChange = $event"
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
  lastColumnFilterChange: { key: string; value: DataTableColumnFilterValue | null } | undefined =
    undefined;

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
    // Fresh fixture so initialPageSize applies during hydration.
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

  describe('column-menu sort', () => {
    it('emits sortChange with the picked direction and resets to page 0', () => {
      api().applySort('name', 'desc');

      expect(host.lastSortChange).toEqual({ active: 'name', direction: 'desc' });
      expect(host.table['sortState']()).toEqual({ active: 'name', direction: 'desc' });
      expect(host.table['pageIndex']()).toBe(0);
    });

    it('emits null and clears the sort state when direction is the empty string', () => {
      api().applySort('name', 'asc');
      api().applySort('name', '');

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

      const apiOf = f.componentInstance.table as unknown as {
        applySort: (key: string, direction: 'asc' | 'desc' | '') => void;
      };
      apiOf.applySort('name', 'asc');

      expect(f.componentInstance.lastPageChange).toEqual({ pageIndex: 0, pageSize: 10 });
    });
  });

  describe('column-menu filters', () => {
    // Vitest fake timers (not Angular's `fakeAsync`) because the project runs zoneless
    // and `zone.js/testing` is not on the classpath. We advance manually past the
    // 250 ms debounceTime in the component's filter wiring.
    beforeEach(() => {
      vi.useFakeTimers();
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('emits a debounced text filter through columnFilterChange', () => {
      const control = host.table['textControl']('name');
      control.setValue('alf');
      vi.advanceTimersByTime(250);

      expect(host.lastColumnFilterChange).toEqual({
        key: 'name',
        value: { type: 'text', value: 'alf' },
      });
    });

    it('emits null when the text filter is cleared so the parent drops the URL param', () => {
      const control = host.table['textControl']('name');
      control.setValue('something');
      vi.advanceTimersByTime(250);

      control.setValue('');
      vi.advanceTimersByTime(250);

      expect(host.lastColumnFilterChange).toEqual({ key: 'name', value: null });
    });

    it('trims whitespace before emitting so leading spaces do not pollute the URL', () => {
      const control = host.table['textControl']('name');
      control.setValue('   ');
      vi.advanceTimersByTime(250);

      expect(host.lastColumnFilterChange).toEqual({ key: 'name', value: null });
    });

    it('emits a combined dateRange payload when either end of the range changes', () => {
      const dateColumns: readonly DataTableColumn<Row>[] = [
        ...columns,
        { key: 'when', label: 'Cuándo', value: () => null, filter: 'dateRange' },
      ];
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = rows;
      f.componentInstance.columns = dateColumns;
      f.detectChanges();

      const from = f.componentInstance.table['dateControl']('when', 'from');
      from.setValue(new Date(2026, 0, 5));
      vi.advanceTimersByTime(250);

      expect(f.componentInstance.lastColumnFilterChange).toEqual({
        key: 'when',
        value: { type: 'dateRange', from: '2026-01-05', to: null },
      });
    });

    it('pre-fills the menu control from columnFilters input (URL → form sync)', () => {
      host.columnFilters = new Map<string, DataTableColumnFilterValue>([
        ['name', { type: 'text', value: 'preloaded' }],
      ]);
      fixture.detectChanges();

      expect(host.table['textControl']('name').value).toBe('preloaded');
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
