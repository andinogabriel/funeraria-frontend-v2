import { NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  computed,
  effect,
  inject,
  input,
  model,
  OnInit,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import type { DataTableColumn, DataTablePreferences, DataTableSort } from './data-table.types';
import { TablePreferencesService } from './table-preferences.service';

/**
 * Generic, signal-driven data table built on top of MatTable.
 *
 * <h3>What this component owns</h3>
 *
 * - Column rendering from a {@link DataTableColumn} array — no per-column template
 *   projection required for the common case.
 * - Client-side sorting via {@link MatSort}; sort direction loops `asc → desc → none`
 *   on the same column.
 * - Column chooser exposed as a `mat-menu` of checkboxes plus an "Aplicar" button —
 *   selections are staged inside the menu and only commit on confirm, matching the
 *   user's request that toggling does not partially re-render the grid.
 * - Pagination through {@link MatPaginator}, with selectable page sizes.
 * - Optional persistence of (visible columns, sort, page size) to localStorage when
 *   the caller passes a `storageKey`.
 *
 * <h3>What it doesn't own (yet)</h3>
 *
 * - Server-side mode: a follow-up PR adds a `serverSide` input and matching outputs
 *   `(sortChange)`/`(pageChange)`/`(filterChange)`. For now the table is purely
 *   client-side and consumes the full `data` array.
 * - Text filter: each page owns its own search input (its UX is page-specific) and
 *   passes the already-filtered data through `[data]`.
 *
 * <h3>Action column</h3>
 *
 * Callers project a single `<ng-template #actions let-row>` content child. When
 * present, it is rendered as a trailing column whose label is configurable through
 * `actionsLabel`. The action column is non-sortable and non-hideable.
 */
@Component({
  selector: 'app-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatPaginatorModule,
    MatSortModule,
    MatTableModule,
    MatTooltipModule,
    NgTemplateOutlet,
  ],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent<T> implements OnInit, AfterViewInit {
  private readonly preferences = inject(TablePreferencesService);

  /** Rows to render. The component does not mutate this array. */
  readonly data = input.required<readonly T[]>();

  /** Column definitions. Order is the canonical render order, left to right. */
  readonly columns = input.required<readonly DataTableColumn<T>[]>();

  /** Stable identifier used by the preferences service. Omit to disable persistence. */
  readonly storageKey = input<string | undefined>(undefined);

  /** Initial sort applied before any persisted preference. */
  readonly initialSort = input<DataTableSort | null>(null);

  /** Initial page size before any persisted preference. */
  readonly initialPageSize = input<number>(10);

  /** Page size choices offered in the paginator. */
  readonly pageSizeOptions = input<readonly number[]>([10, 25, 50, 100]);

  /**
   * Hides the column-chooser button in the toolbar. Useful for tables that ship with
   * a curated column set and do not want to expose runtime customisation.
   */
  readonly hideColumnChooser = input<boolean>(false);

  /**
   * Hides the page-size selector dropdown inside the paginator while keeping the
   * navigation arrows. Combine with `initialPageSize` to lock the table at a fixed
   * page count.
   */
  readonly hidePageSizeSelector = input<boolean>(false);

  /**
   * Pads the rendered page with empty placeholder rows so the table always shows
   * `pageSize` row heights. Visual goal: the table footprint never shrinks just
   * because the data is shorter than a full page — useful in dashboards where the
   * layout is expected to stay stable across data refreshes.
   */
  readonly padToPageSize = input<boolean>(false);

  /**
   * Enables single-row selection. When true, clicking a data row sets
   * `selectedRow`; clicking the already-selected row clears it. Placeholder rows
   * (from `padToPageSize`) are not selectable. The selected row gets a Material
   * "secondary container" highlight so callers can drive selection-dependent
   * affordances (toolbar buttons, etc.) off the model without inventing a
   * parallel state channel.
   */
  readonly selectable = input<boolean>(false);

  /**
   * Two-way bound currently-selected row. `model()` (Angular 17+) lets callers
   * bind with `[(selectedRow)]` so the parent owns the canonical state and can
   * clear the selection imperatively (after a delete succeeds, after a manual
   * refresh, etc.) without going through an event.
   */
  readonly selectedRow = model<T | null>(null);

  /** Label of the trailing action column when an `actions` template is projected. */
  readonly actionsLabel = input<string>('Acciones');

  /** Row track-by accessor. Defaults to identity (Angular's default) when unset. */
  readonly trackBy = input<(index: number, row: T) => unknown>((_, row) => row);

  /**
   * Internal wrapper around the caller's `trackBy` that tolerates `null` placeholder
   * rows emitted when `padToPageSize` is on. The wrapper short-circuits to a stable
   * `__placeholder_<index>` id for nulls so MatTable can dedupe placeholder rows
   * across re-renders without the caller having to know about padding semantics.
   */
  protected readonly effectiveTrackBy = (index: number, row: T | null): unknown =>
    row === null ? `__placeholder_${index}` : this.trackBy()(index, row);

  /** Optional content-projected trailing column for row actions. */
  @ContentChild('actions', { read: TemplateRef })
  protected actionsTemplate: TemplateRef<{ $implicit: T }> | null = null;

  @ViewChild(MatSort) protected sort?: MatSort;
  @ViewChild(MatPaginator) protected paginator?: MatPaginator;

  /** Persisted sort, mirrored as a signal so the template can read it synchronously. */
  protected readonly sortState = signal<DataTableSort | null>(null);

  /** Currently visible column keys, in render order. */
  protected readonly visibleColumns = signal<readonly string[]>([]);

  /** Staged selection inside the column-chooser menu — only commits on "Aplicar". */
  protected readonly draftVisibleColumns = signal<ReadonlySet<string>>(new Set());

  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(10);

  /** Sorted view over `data()` using the column accessor for comparison. */
  protected readonly sortedData = computed<readonly T[]>(() => {
    const rows = this.data();
    const current = this.sortState();
    if (!current || current.direction === '') {
      return rows;
    }
    const column = this.columns().find((c) => c.key === current.active);
    if (!column) {
      return rows;
    }
    const direction = current.direction === 'asc' ? 1 : -1;
    // Materialise the array so the input is never mutated. Null handling is applied
    // BEFORE the direction multiplier so empty rows always sort last regardless of
    // asc/desc — flipping direction must not promote null entries to the top.
    return [...rows].sort((a, b) => {
      const va = column.value(a);
      const vb = column.value(b);
      const nullOrder = compareNullish(va, vb);
      if (nullOrder !== null) {
        return nullOrder;
      }
      return compareValues(va, vb) * direction;
    });
  });

  /**
   * Sliced page over `sortedData()` that MatTable actually renders. When
   * `padToPageSize` is enabled, the slice is right-padded with `null` placeholders
   * so the rendered row count always matches the page size. Cell and action
   * templates skip `null` rows (no `value` accessor is invoked for them) so the
   * placeholder visuals are blank.
   */
  protected readonly pagedData = computed<readonly (T | null)[]>(() => {
    const all = this.sortedData();
    const start = this.pageIndex() * this.pageSize();
    const slice = all.slice(start, start + this.pageSize());
    if (!this.padToPageSize()) {
      return slice;
    }
    const missing = this.pageSize() - slice.length;
    if (missing <= 0) {
      return slice;
    }
    return [...slice, ...(Array(missing).fill(null) as null[])];
  });

  /** Full display order = visible config columns + action column when projected. */
  protected readonly displayedColumns = computed<readonly string[]>(() => {
    const visible = this.visibleColumns();
    return this.actionsTemplate ? [...visible, '__actions__'] : visible;
  });

  /** Columns the user can toggle from the chooser (i.e. `hideable !== false`). */
  protected readonly hideableColumns = computed<readonly DataTableColumn<T>[]>(() =>
    this.columns().filter((c) => c.hideable !== false),
  );

  constructor() {
    // Persist on every relevant change once we're past the initial hydration. We guard
    // against the first run with a signal so we don't overwrite the user's existing
    // preferences with the page-default values during construction.
    effect(() => {
      if (!this.hydrated()) {
        return;
      }
      const key = this.storageKey();
      if (!key) {
        return;
      }
      const payload: DataTablePreferences = {
        version: 1,
        visibleColumns: this.visibleColumns(),
        sort: this.sortState(),
        pageSize: this.pageSize(),
      };
      this.preferences.save(key, payload);
    });
  }

  /** Tracks whether the component finished applying defaults/persisted state. */
  private readonly hydrated = signal(false);

  ngOnInit(): void {
    this.hydrateFromPreferences();
  }

  ngAfterViewInit(): void {
    // Wire MatSort's stream into our signal so the computed view stays in sync. We do
    // this in AfterViewInit because the directive is queried with @ViewChild.
    this.sort?.sortChange.subscribe((next: Sort) => {
      this.sortState.set({
        active: next.active,
        direction: next.direction,
      });
      this.pageIndex.set(0);
    });

    this.paginator?.page.subscribe((event) => {
      this.pageIndex.set(event.pageIndex);
      this.pageSize.set(event.pageSize);
    });
  }

  /** Opens the chooser — seed the staging set from the current visible columns. */
  protected onChooserOpen(): void {
    this.draftVisibleColumns.set(new Set(this.visibleColumns()));
  }

  /**
   * Toggles a column inside the staging set. We work on a fresh `Set` so signal
   * subscribers see a new reference and re-render predictably.
   */
  protected onDraftToggle(key: string, checked: boolean): void {
    const next = new Set(this.draftVisibleColumns());
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    this.draftVisibleColumns.set(next);
  }

  /**
   * Commits the staging set. We rebuild `visibleColumns` from the column array's
   * order so the rendered order is independent of the user's checkbox click order
   * and matches the canonical config — that's the principle of least surprise.
   */
  protected onApplyColumns(): void {
    const draft = this.draftVisibleColumns();
    const ordered = this.columns()
      .filter((c) => draft.has(c.key) || c.hideable === false)
      .map((c) => c.key);
    // At least one user-toggleable column must remain visible — otherwise the user
    // ends up with just the action column and no way to tell rows apart. Reject the
    // empty case by keeping the previous selection.
    if (ordered.filter((k) => this.hideableColumns().some((c) => c.key === k)).length === 0) {
      return;
    }
    this.visibleColumns.set(ordered);
  }

  /** Restores defaults (every column with `defaultVisible !== false`). */
  protected onResetColumns(): void {
    this.visibleColumns.set(this.computeDefaultVisible());
    this.draftVisibleColumns.set(new Set(this.computeDefaultVisible()));
    this.sortState.set(this.initialSort());
    this.pageSize.set(this.initialPageSize());
    this.pageIndex.set(0);
  }

  /** Whether a column key is currently staged as visible inside the chooser. */
  protected isDraftChecked(key: string): boolean {
    return this.draftVisibleColumns().has(key);
  }

  /** Selected count for the chooser caption. */
  protected readonly draftCount = computed(() => this.draftVisibleColumns().size);

  /**
   * Row click handler driving the single-row selection model. Ignored when
   * `selectable` is off or when the clicked row is a `null` placeholder. Clicking
   * the already-selected row clears the selection — that's the discoverable
   * "click again to deselect" pattern and avoids stranding the user with a
   * selection they cannot drop without using the keyboard.
   */
  protected onRowClick(row: T | null): void {
    if (!this.selectable() || row === null) {
      return;
    }
    this.selectedRow.update((current) => (current === row ? null : row));
  }

  /**
   * Computes the class list applied to each rendered row. We keep the logic in
   * TS so the template can stay declarative and `:hover` styles still flow
   * through Tailwind utilities without leaking into the component's own SCSS.
   */
  protected rowClasses(row: T | null): string {
    if (!this.selectable() || row === null) {
      return '';
    }
    return this.selectedRow() === row
      ? 'cursor-pointer bg-[var(--mat-sys-secondary-container)]'
      : 'cursor-pointer hover:bg-[var(--mat-sys-surface-container-high)]';
  }

  private hydrateFromPreferences(): void {
    const defaults = this.computeDefaultVisible();
    const key = this.storageKey();
    const persisted = key ? this.preferences.load(key) : null;

    if (persisted) {
      // Filter persisted keys against the current column config — a column might have
      // been removed since the preferences were saved.
      const validVisible = persisted.visibleColumns.filter((k) =>
        this.columns().some((c) => c.key === k),
      );
      this.visibleColumns.set(validVisible.length > 0 ? validVisible : defaults);
      this.sortState.set(persisted.sort);
      this.pageSize.set(persisted.pageSize);
    } else {
      this.visibleColumns.set(defaults);
      this.sortState.set(this.initialSort());
      this.pageSize.set(this.initialPageSize());
    }

    this.hydrated.set(true);
  }

  private computeDefaultVisible(): readonly string[] {
    return this.columns()
      .filter((c) => c.defaultVisible !== false)
      .map((c) => c.key);
  }
}

/**
 * Returns a direction-independent ordering when either value is nullish (so empty
 * rows always sort last), or `null` to signal "both values are present, fall back to
 * `compareValues` and apply the asc/desc multiplier upstream".
 */
function compareNullish(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined,
): number | null {
  const aMissing = a === null || a === undefined || a === '';
  const bMissing = b === null || b === undefined || b === '';
  if (aMissing && bMissing) {
    return 0;
  }
  if (aMissing) {
    return 1;
  }
  if (bMissing) {
    return -1;
  }
  return null;
}

/**
 * Compares two non-nullish values from a column accessor. Strings sort
 * case-insensitively with locale-aware collation; numbers and dates compare
 * natively. The caller is responsible for filtering nullish values first.
 */
function compareValues(
  a: string | number | Date | null | undefined,
  b: string | number | Date | null | undefined,
): number {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true });
}
