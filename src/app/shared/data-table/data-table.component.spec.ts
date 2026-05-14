import { Component, ViewChild } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';

import { DataTableComponent } from './data-table.component';
import type { DataTableColumn } from './data-table.types';
import { TablePreferencesService } from './table-preferences.service';

interface Row {
  readonly id: number;
  readonly name: string;
  readonly score: number | null;
}

/**
 * Host component used by tests so we can pass inputs through `[data]` / `[columns]`
 * bindings instead of poking the standalone component's signal inputs directly.
 * Working through the regular Angular API also keeps the tests honest about the
 * public contract callers will use.
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
      [padToPageSize]="padToPageSize"
      [selectable]="selectable"
      [serverSide]="serverSide"
      [totalElements]="totalElements"
      (sortChange)="lastSortChange = $event"
      (pageChange)="lastPageChange = $event"
    />
  `,
})
class HostComponent {
  rows: readonly Row[] = [];
  columns: readonly DataTableColumn<Row>[] = [];
  storageKey: string | undefined = undefined;
  initialSort: { active: string; direction: 'asc' | 'desc' | '' } | null = null;
  initialPageSize = 50;
  padToPageSize = false;
  selectable = false;
  serverSide = false;
  totalElements = 0;
  lastSortChange: { active: string; direction: 'asc' | 'desc' | '' } | null | undefined = undefined;
  lastPageChange: { pageIndex: number; pageSize: number } | undefined = undefined;

  @ViewChild(DataTableComponent) table!: DataTableComponent<Row>;
}

describe('DataTableComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;

  const columns: readonly DataTableColumn<Row>[] = [
    { key: 'id', label: 'ID', value: (r) => r.id, hideable: false },
    { key: 'name', label: 'Nombre', value: (r) => r.name },
    { key: 'score', label: 'Puntaje', value: (r) => r.score, defaultVisible: false },
  ];

  const rows: readonly Row[] = [
    { id: 1, name: 'Bravo', score: 30 },
    { id: 2, name: 'alfa', score: null },
    { id: 3, name: 'Carla', score: 10 },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [HostComponent, NoopAnimationsModule] });
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

    // 'id' is non-hideable so it must remain regardless of the draft set; 'score' was
    // promoted, 'name' was demoted. The resulting order matches the column config,
    // NOT the toggle order.
    expect(host.table['visibleColumns']()).toEqual(['id', 'score']);
  });

  it('rejects an apply that would leave zero hideable columns visible', () => {
    api().onChooserOpen();
    api().onDraftToggle('name', false);
    api().onDraftToggle('score', false);
    api().onApplyColumns();

    // Previous selection remains because the apply was rejected.
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

  it('pads the page with null placeholders up to the page size when padToPageSize is on', () => {
    // Spin up a fresh fixture so `initialPageSize` is applied during hydration —
    // the shared `beforeEach` already detected changes with the host's default 50.
    const f = TestBed.createComponent(HostComponent);
    f.componentInstance.rows = rows;
    f.componentInstance.columns = columns;
    f.componentInstance.initialPageSize = 5;
    f.componentInstance.padToPageSize = true;
    f.detectChanges();

    const page = f.componentInstance.table['pagedData']();
    expect(page).toHaveLength(5);
    expect(page.slice(0, 3).every((r) => r !== null)).toBe(true);
    expect(page.slice(3).every((r) => r === null)).toBe(true);
  });

  it('does not pad when padToPageSize is off (default)', () => {
    const f = TestBed.createComponent(HostComponent);
    f.componentInstance.rows = rows;
    f.componentInstance.columns = columns;
    f.componentInstance.initialPageSize = 5;
    f.detectChanges();

    expect(f.componentInstance.table['pagedData']()).toHaveLength(3);
  });

  it('returns a stable placeholder id from the internal trackBy for null rows', () => {
    host.padToPageSize = true;
    fixture.detectChanges();

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

      // Setting a sort signal would normally re-order client-side; in server-side
      // mode the rows must come through untouched (parent is responsible for
      // sorting the page on the server before passing it in).
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
      f.componentInstance.initialPageSize = 2;
      f.detectChanges();

      const table = f.componentInstance.table as unknown as {
        pagedData: () => readonly (Row | null)[];
      };

      // Even with pageSize=2 and 3 rows, server-side should render all 3 because
      // the parent supposedly hand-picked exactly this page.
      expect(table.pagedData()).toHaveLength(rows.length);
    });

    it('uses totalElements for paginatorLength instead of data.length', () => {
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = rows; // 3 rows in the page
      f.componentInstance.columns = columns;
      f.componentInstance.serverSide = true;
      f.componentInstance.totalElements = 248;
      f.detectChanges();

      const table = f.componentInstance.table as unknown as { paginatorLength: () => number };
      expect(table.paginatorLength()).toBe(248);
    });

    it('emits sortChange with the new sort and resets to page 0 with a pageChange', async () => {
      const f = TestBed.createComponent(HostComponent);
      f.componentInstance.rows = rows;
      f.componentInstance.columns = columns;
      f.componentInstance.serverSide = true;
      f.componentInstance.totalElements = 50;
      f.componentInstance.initialPageSize = 10;
      f.detectChanges();

      // Drive the MatSort stream the same way the user would by clicking a header.
      // We reach into the view-child reference and emit a Sort event manually so
      // the test does not depend on DOM interaction plumbing.
      const internal = f.componentInstance.table as unknown as {
        sort: {
          sortChange: { emit: (s: { active: string; direction: 'asc' | 'desc' | '' }) => void };
        };
      };
      internal.sort.sortChange.emit({ active: 'name', direction: 'desc' });

      expect(f.componentInstance.lastSortChange).toEqual({ active: 'name', direction: 'desc' });
      expect(f.componentInstance.lastPageChange).toEqual({ pageIndex: 0, pageSize: 10 });
    });
  });

  it('still applies internal sort in client-side mode (default)', () => {
    host.table['sortState'].set({ active: 'name', direction: 'asc' });
    fixture.detectChanges();

    expect(host.table['sortedData']().map((r) => r.name)).toEqual(['alfa', 'Bravo', 'Carla']);
  });
});
