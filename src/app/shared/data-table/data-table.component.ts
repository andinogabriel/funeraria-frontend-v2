import { NgTemplateOutlet } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ContentChild,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  OnInit,
  output,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime } from 'rxjs/operators';

import type {
  DataTableColumn,
  DataTableColumnFilterValue,
  DataTableEmptyState,
  DataTablePreferences,
  DataTableSort,
  DataTableSortDirection,
} from './data-table.types';
import { TablePreferencesService } from './table-preferences.service';

/**
 * Generic, signal-driven data table built on top of MatTable.
 *
 * <h3>What this component owns</h3>
 *
 * - Column rendering from a {@link DataTableColumn} array — no per-column template
 *   projection required for the common case.
 * - **Touch-friendly column-header menu** (ADR-0014 of the FE): clicking a header opens
 *   a `mat-menu` carrying the column's filter input (text or date range) plus three
 *   sort options (asc / desc / clear). The whole header cell is a 44 px hit target,
 *   with a hover affordance and an active-filter dot when the column constrains the
 *   result set. No filter inputs above the table — the menu is the only entry point.
 * - **Per-column filtering** through a controlled-component contract: parent passes
 *   {@link columnFilters}, table emits {@link columnFilterChange} on debounced input.
 *   The parent maps each column's filter to whichever backend param applies on that
 *   page (eg. `Recibo` text → `q`, `Fecha` dateRange → `from`/`to`).
 * - **Always-fixed-height** body: every page pads to `pageSize` row heights so the
 *   table footprint never shrinks just because the result set is shorter. When the
 *   result is empty the body renders {@link emptyState} centred over the same
 *   reserved height instead of collapsing.
 * - Column chooser exposed as a `mat-menu` of checkboxes plus an "Aplicar" button —
 *   selections are staged inside the menu and only commit on confirm.
 * - Pagination through {@link MatPaginator}, with selectable page sizes.
 * - Optional persistence of (visible columns, sort, page size) to localStorage when
 *   the caller passes a `storageKey`.
 *
 * <h3>Client-side vs server-side</h3>
 *
 * Default (`serverSide=false`): the table consumes the full dataset through
 * `data` and applies sort + pagination internally. Best for small datasets
 * that fit in memory comfortably. Column filters are NOT applied locally in
 * v1 — the parent owns the filter→data pipeline (most call sites already
 * fetch filtered data anyway).
 *
 * Server-side (`serverSide=true`): the parent owns sort + paging + filtering.
 * The table:
 * - Renders `data` as-is — no internal sort, no internal slicing.
 * - Uses `totalElements` instead of `data.length` for the paginator length so
 *   the prev/next arrows reflect the full dataset.
 * - Emits `sortChange`, `pageChange` and `columnFilterChange` so the parent
 *   can re-fetch the matching page from the server.
 * - Skips persisting page state — the page index is volatile across
 *   navigations and persisting it would surprise users on return.
 *
 * <h3>Action column</h3>
 *
 * Callers project a single `<ng-template #actions let-row>` content child. When
 * present, it is rendered as a trailing column whose label is configurable through
 * `actionsLabel`. The action column is non-sortable, non-hideable, and its header
 * does NOT open a column menu.
 */
@Component({
  selector: 'app-data-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCheckboxModule,
    MatDatepickerModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatTableModule,
    MatTooltipModule,
    NgTemplateOutlet,
    ReactiveFormsModule,
  ],
  templateUrl: './data-table.component.html',
  styleUrl: './data-table.component.scss',
})
export class DataTableComponent<T> implements OnInit, AfterViewInit {
  private readonly preferences = inject(TablePreferencesService);
  // Captured in the field initialiser so we can pass it to `takeUntilDestroyed()`
  // calls that happen outside the constructor injection context (`ngOnInit`'s
  // `wireFilterControls` is the call site that needs it today).
  private readonly destroyRef = inject(DestroyRef);

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

  /**
   * Initial page index. Honoured in server-side mode so the parent can restore the page
   * from a URL query param after a refresh / back-navigation. Ignored in client-side mode
   * where the parent has no need to drive the paginator — the table owns the slice.
   */
  readonly initialPageIndex = input<number>(0);

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
   * Active filter values, keyed by column key. The table renders the matching input
   * inside the column-header menu pre-populated from this map; user edits are
   * debounced and emitted through {@link columnFilterChange}. The parent stays the
   * canonical owner of filter state (typical URL-sync flow).
   */
  readonly columnFilters = input<ReadonlyMap<string, DataTableColumnFilterValue>>(new Map());

  /**
   * Empty-state visuals rendered inside the table body when `data.length === 0`. The
   * header + paginator stay visible. When omitted, the empty body renders blank
   * placeholder rows (the previous behaviour, kept for backwards compat).
   */
  readonly emptyState = input<DataTableEmptyState | null>(null);

  /**
   * Enables single-row selection. When true, clicking a data row sets
   * `selectedRow`; clicking the already-selected row clears it. Placeholder rows are
   * not selectable. The selected row gets a Material "primary container" highlight
   * so callers can drive selection-dependent affordances (toolbar buttons, etc.) off
   * the model without inventing a parallel state channel.
   */
  readonly selectable = input<boolean>(false);

  /**
   * Two-way bound currently-selected row. `model()` (Angular 17+) lets callers
   * bind with `[(selectedRow)]` so the parent owns the canonical state and can
   * clear the selection imperatively (after a delete succeeds, after a manual
   * refresh, etc.) without going through an event.
   */
  readonly selectedRow = model<T | null>(null);

  /**
   * Switches the table from client-side mode (default) to server-side. In
   * server-side mode the table:
   * - Does NOT sort `data` locally; it renders the array as-is.
   * - Does NOT slice `data` to a single page; the parent is expected to pass
   *   only the current page's rows.
   * - Uses {@link totalElements} for the paginator's total count instead of
   *   the `data.length` fallback.
   * - Emits `(sortChange)` / `(pageChange)` / `(columnFilterChange)` so the
   *   parent can re-fetch.
   * - Skips persisting page state through `storageKey` (sort + visible columns
   *   are still persisted — those are stable preferences worth restoring).
   */
  readonly serverSide = input<boolean>(false);

  /**
   * Total number of rows in the dataset when `serverSide` is on. Used as the
   * paginator's `length` so prev/next arrows reflect the full server-side
   * dataset, not just the current page. Ignored when `serverSide=false`.
   */
  readonly totalElements = input<number>(0);

  /**
   * Fires when the user changes the sort via a column-menu sort option. The
   * emitted value matches the internal sort signal so the parent can pass it
   * straight to a `Pageable` request without further translation. `null` is
   * emitted when the user clicks "Quitar orden".
   */
  readonly sortChange = output<DataTableSort | null>();

  /**
   * Fires when the user navigates pages or changes the page size. Shape mirrors
   * Material's {@link PageEvent} pared down to the fields a `Pageable`-style
   * server request actually needs.
   */
  readonly pageChange = output<{ pageIndex: number; pageSize: number }>();

  /**
   * Fires (debounced 250 ms) when a column filter input inside a header menu changes.
   * `value === null` signals "filter cleared" — the parent should drop the
   * corresponding URL param. Server-side parents typically map this directly to a
   * fetch + page reset; client-side parents that want filtering today filter their
   * own data and pass the result back through `data`.
   */
  readonly columnFilterChange = output<{
    key: string;
    value: DataTableColumnFilterValue | null;
  }>();

  /** Label of the trailing action column when an `actions` template is projected. */
  readonly actionsLabel = input<string>('Acciones');

  /** Row track-by accessor. Defaults to identity (Angular's default) when unset. */
  readonly trackBy = input<(index: number, row: T) => unknown>((_, row) => row);

  /**
   * Internal wrapper around the caller's `trackBy` that tolerates `null` placeholder
   * rows emitted as filler. The wrapper short-circuits to a stable
   * `__placeholder_<index>` id for nulls so MatTable can dedupe placeholder rows
   * across re-renders without the caller having to know about padding semantics.
   */
  protected readonly effectiveTrackBy = (index: number, row: T | null): unknown =>
    row === null ? `__placeholder_${index}` : this.trackBy()(index, row);

  /** Optional content-projected trailing column for row actions. */
  @ContentChild('actions', { read: TemplateRef })
  protected actionsTemplate: TemplateRef<{ $implicit: T }> | null = null;

  @ViewChild(MatPaginator) protected paginator?: MatPaginator;

  /** Persisted sort, mirrored as a signal so the template can read it synchronously. */
  protected readonly sortState = signal<DataTableSort | null>(null);

  /** Currently visible column keys, in render order. */
  protected readonly visibleColumns = signal<readonly string[]>([]);

  /** Staged selection inside the column-chooser menu — only commits on "Aplicar". */
  protected readonly draftVisibleColumns = signal<ReadonlySet<string>>(new Set());

  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(10);

  /**
   * Form controls backing the in-menu filter inputs. We hold ONE control per filter
   * row (text columns get a single string control; dateRange columns get two date
   * controls keyed `<key>:from` / `<key>:to`). The map is keyed by column key + a
   * `:from` / `:to` suffix for dateRange so the template's `formControl` binding
   * stays trivial and we do not have to thread `FormGroup` instances per column.
   */
  protected readonly filterControls = new Map<string, FormControl<string | Date | null>>();

  /**
   * Sorted view over `data()`. In server-side mode the parent is responsible
   * for ordering before passing the rows in, so we render the array verbatim;
   * applying a second local sort would re-order an already-sorted page in
   * surprising ways. In client-side mode we run the column accessor through
   * a locale-aware comparator and keep nullish values at the bottom.
   */
  protected readonly sortedData = computed<readonly T[]>(() => {
    const rows = this.data();
    if (this.serverSide()) {
      return rows;
    }
    const current = this.sortState();
    if (!current || current.direction === '') {
      return rows;
    }
    const column = this.columns().find((c) => c.key === current.active);
    if (!column) {
      return rows;
    }
    const direction = current.direction === 'asc' ? 1 : -1;
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
   * Rows MatTable actually renders. In server-side mode `data()` already IS
   * the current page, so we render it as-is (after null padding). In
   * client-side mode we slice the sorted view to the current page bounds.
   *
   * The result is always right-padded with `null` placeholders so the rendered
   * row count matches the page size — the table footprint stays stable
   * regardless of result count. Cell and action templates skip `null` rows
   * (no `value` accessor is invoked for them) so the placeholder visuals are
   * blank. When the actual data is empty, {@link showEmptyState} flips and
   * the body renders the empty-state overlay instead of the placeholder rows.
   */
  protected readonly pagedData = computed<readonly (T | null)[]>(() => {
    const all = this.sortedData();
    const slice = this.serverSide()
      ? all
      : all.slice(this.pageIndex() * this.pageSize(), (this.pageIndex() + 1) * this.pageSize());
    const missing = this.pageSize() - slice.length;
    if (missing <= 0) {
      return slice;
    }
    return [...slice, ...(Array(missing).fill(null) as null[])];
  });

  /**
   * `true` when there are zero real rows in the current page. Drives the
   * empty-state overlay vs. the regular padded body. Server-side mode keys off
   * `totalElements`; client-side mode keys off the local dataset.
   */
  protected readonly showEmptyState = computed<boolean>(() => {
    const realRowCount = this.serverSide() ? this.totalElements() : this.sortedData().length;
    return realRowCount === 0 && this.emptyState() !== null;
  });

  /**
   * Total dataset length the paginator should show. Server-side mode uses the
   * caller-provided `totalElements`; client-side falls back to the locally
   * sorted dataset length.
   */
  protected readonly paginatorLength = computed<number>(() =>
    this.serverSide() ? this.totalElements() : this.sortedData().length,
  );

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

    // Parent → menu: keep the per-column form controls in sync with the parent-owned
    // filter map on every change (URL navigation, programmatic reset, etc.). The
    // `emitValueEvent: false` patches avoid bouncing the user's input back through
    // the debounced output below — we only want to emit when the user types, not when
    // the parent acknowledges.
    effect(() => {
      const filters = this.columnFilters();
      for (const column of this.columns()) {
        if (!column.filter) {
          continue;
        }
        const value = filters.get(column.key);
        if (column.filter === 'text') {
          const control = this.ensureControl(column.key);
          const next = value && value.type === 'text' ? value.value : '';
          if (control.value !== next) {
            control.setValue(next, { emitEvent: false });
          }
        } else if (column.filter === 'dateRange') {
          const fromControl = this.ensureControl(`${column.key}:from`);
          const toControl = this.ensureControl(`${column.key}:to`);
          const fromVal = value && value.type === 'dateRange' ? parseIsoDate(value.from) : null;
          const toVal = value && value.type === 'dateRange' ? parseIsoDate(value.to) : null;
          if (!datesEqual(fromControl.value as Date | null, fromVal)) {
            fromControl.setValue(fromVal, { emitEvent: false });
          }
          if (!datesEqual(toControl.value as Date | null, toVal)) {
            toControl.setValue(toVal, { emitEvent: false });
          }
        }
      }
    });
  }

  /** Tracks whether the component finished applying defaults/persisted state. */
  private readonly hydrated = signal(false);

  ngOnInit(): void {
    this.hydrateFromPreferences();
    this.wireFilterControls();
  }

  ngAfterViewInit(): void {
    this.paginator?.page.subscribe((event) => {
      this.pageIndex.set(event.pageIndex);
      this.pageSize.set(event.pageSize);
      this.pageChange.emit({ pageIndex: event.pageIndex, pageSize: event.pageSize });
    });
  }

  /**
   * Builds (or returns the existing) FormControl backing a filter input. The control
   * map is created lazily so columns without `filter` never carry an unused control,
   * and the same control identity persists across re-renders so Material's
   * `[formControl]` binding stays stable.
   */
  protected ensureControl(key: string): FormControl<string | Date | null> {
    let control = this.filterControls.get(key);
    if (!control) {
      // The control accepts string | Date | null so the same map can back text and
      // dateRange columns. Type narrowing happens in the wiring code below.
      control = new FormControl<string | Date | null>('', { nonNullable: false });
      this.filterControls.set(key, control);
    }
    return control;
  }

  /** Public template accessor — keeps the HTML tidy. */
  protected textControl(key: string): FormControl<string | Date | null> {
    return this.ensureControl(key);
  }

  protected dateControl(key: string, end: 'from' | 'to'): FormControl<string | Date | null> {
    return this.ensureControl(`${key}:${end}`);
  }

  /**
   * Subscribes to each filter control's debounced valueChanges and emits
   * `columnFilterChange` on the discriminated-union shape. The emission for a
   * dateRange combines from + to into a single payload so the parent only updates the
   * URL once per user action.
   */
  private wireFilterControls(): void {
    for (const column of this.columns()) {
      if (column.filter === 'text') {
        const control = this.ensureControl(column.key);
        control.valueChanges
          .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
          .subscribe((raw) => {
            const value = typeof raw === 'string' ? raw.trim() : '';
            this.columnFilterChange.emit({
              key: column.key,
              value: value.length === 0 ? null : { type: 'text', value },
            });
          });
      } else if (column.filter === 'dateRange') {
        const fromControl = this.ensureControl(`${column.key}:from`);
        const toControl = this.ensureControl(`${column.key}:to`);
        // Both ends emit through the same combined event so the parent only updates
        // the URL once per user action — a debounce of 0 would suffice here but we
        // keep 250 ms to match the text filter cadence.
        const emit = (): void => {
          const from = fromControl.value instanceof Date ? toIsoDate(fromControl.value) : null;
          const to = toControl.value instanceof Date ? toIsoDate(toControl.value) : null;
          if (from === null && to === null) {
            this.columnFilterChange.emit({ key: column.key, value: null });
          } else {
            this.columnFilterChange.emit({
              key: column.key,
              value: { type: 'dateRange', from, to },
            });
          }
        };
        fromControl.valueChanges
          .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
          .subscribe(emit);
        toControl.valueChanges
          .pipe(debounceTime(250), takeUntilDestroyed(this.destroyRef))
          .subscribe(emit);
      }
    }
  }

  /** Opens the column chooser — seed the staging set from the current visible columns. */
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
   * Applies an explicit sort direction selected from a column-menu item. `null`
   * clears the sort. Always resets to page 0 — staying on page N after a sort that
   * reorders the dataset would surprise the user.
   */
  protected applySort(columnKey: string, direction: DataTableSortDirection): void {
    if (direction === '') {
      this.sortState.set(null);
      this.sortChange.emit(null);
    } else {
      const next: DataTableSort = { active: columnKey, direction };
      this.sortState.set(next);
      this.sortChange.emit(next);
    }
    this.pageIndex.set(0);
    if (this.serverSide()) {
      this.pageChange.emit({ pageIndex: 0, pageSize: this.pageSize() });
    }
  }

  /**
   * Reads whether a column currently carries a filter value. Drives the active-filter
   * dot on the column header so the user can tell at a glance which columns are
   * constraining the result set.
   */
  protected hasActiveFilter(key: string): boolean {
    const value = this.columnFilters().get(key);
    if (!value) {
      return false;
    }
    if (value.type === 'text') {
      return value.value.length > 0;
    }
    return value.from !== null || value.to !== null;
  }

  /**
   * Whether the column header currently carries the active sort. Drives the active
   * sort icon + tints the dot.
   */
  protected currentSortDirection(key: string): DataTableSortDirection {
    const current = this.sortState();
    return current && current.active === key ? current.direction : '';
  }

  /**
   * Row click handler driving the single-row selection model. Ignored when
   * `selectable` is off or when the clicked row is a `null` placeholder.
   */
  protected onRowClick(row: T | null): void {
    if (!this.selectable() || row === null) {
      return;
    }
    this.selectedRow.update((current) => (current === row ? null : row));
  }

  /**
   * Computes the class list applied to each rendered row. Keeps logic in TS so the
   * template stays declarative.
   */
  protected rowClasses(row: T | null): string {
    if (!this.selectable() || row === null) {
      return '';
    }
    return this.selectedRow() === row
      ? 'cursor-pointer !bg-[var(--mat-sys-primary-container)] !text-[var(--mat-sys-on-primary-container)] font-medium'
      : 'cursor-pointer hover:!bg-[var(--mat-sys-surface-container-high)]';
  }

  private hydrateFromPreferences(): void {
    const defaults = this.computeDefaultVisible();
    const key = this.storageKey();
    const persisted = key ? this.preferences.load(key) : null;

    if (persisted) {
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
    this.pageIndex.set(this.initialPageIndex());

    this.hydrated.set(true);
  }

  private computeDefaultVisible(): readonly string[] {
    return this.columns()
      .filter((c) => c.defaultVisible !== false)
      .map((c) => c.key);
  }
}

/** Returns a direction-independent nullish ordering, or `null` to defer to `compareValues`. */
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

/** ISO `yyyy-MM-dd` → JS Date for the datepicker. `null` on bad input. */
function parseIsoDate(value: string | null): Date | null {
  if (value === null) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/** JS Date → ISO `yyyy-MM-dd` (no timezone shift; pulls local Y/M/D). */
function toIsoDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Equality on dates with both possibly null. */
function datesEqual(a: Date | null, b: Date | null): boolean {
  if (a === null && b === null) {
    return true;
  }
  if (a === null || b === null) {
    return false;
  }
  return a.getTime() === b.getTime();
}
