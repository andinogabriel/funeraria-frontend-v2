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
  output,
  signal,
  TemplateRef,
  ViewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatRadioModule } from '@angular/material/radio';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';

import type {
  DataTableAutocompleteOption,
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
 * <h3>Touch-first column-header menu (the headline feature)</h3>
 *
 * Clicking a column header opens a `mat-menu` carrying that column's filter input
 * (text / dateRange / autocomplete) followed by sort options (asc / desc / none).
 * Everything inside the menu is <b>staged</b>: the user types / picks / selects
 * without affecting the table until they hit "Aceptar". Closing the menu via Esc or
 * outside-click discards the staged changes. This is the same draft + commit pattern
 * the column chooser already uses; the consistency is intentional.
 *
 * <p>The whole header cell is a 44 px tap target. An active-filter dot + tinted
 * label appear when the column constrains the result set; an arrow icon shows the
 * current sort direction. Both interactions are disabled (no hover, no click) when
 * the table is in empty state — the user can still tap "Limpiar filtros" on the page
 * toolbar but cannot open a column menu, since a menu would commit a filter against
 * an empty dataset.
 *
 * <p>For columns without a filter, the menu still opens but only carries the sort
 * options. Sort options commit immediately on click (no Aceptar required) because
 * there is no other staged state to coordinate with.
 *
 * <h3>Per-column filtering through a controlled contract</h3>
 *
 * Parent passes {@link columnFilters}, table emits {@link columnFilterChange} when
 * the user commits via Aceptar. Each page maps each column key to whichever backend
 * param applies on that page (eg. `Recibo` text → `receiptNumber`, `Fecha` dateRange
 * → `from`/`to`, `Proveedor` autocomplete → `supplierNif`). The controlled contract
 * keeps URL-sync trivial — the parent is the canonical owner of filter state.
 *
 * <h3>Empty state</h3>
 *
 * When `data.length === 0` (or `totalElements === 0` in server-side mode) AND an
 * {@link emptyState} config is supplied, the table renders the header row normally
 * (column names visible but interactions disabled) and replaces the body with the
 * centered illustration sized to ~10 row heights so the layout never collapses. The
 * paginator stays visible but with its controls disabled.
 *
 * <h3>Client-side vs server-side</h3>
 *
 * Default (`serverSide=false`): the table consumes the full dataset through `data`
 * and applies sort + pagination internally.
 *
 * Server-side (`serverSide=true`): the parent owns sort + paging + filtering. The
 * table renders `data` as-is, uses `totalElements` for the paginator length, and
 * emits `sortChange`, `pageChange`, `columnFilterChange` so the parent can re-fetch.
 *
 * <h3>Action column</h3>
 *
 * Callers project a single `<ng-template #actions let-row>` content child. When
 * present it is rendered as a trailing column whose header does NOT open a menu.
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
    MatRadioModule,
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

  /** Initial page index. Honoured in server-side mode for URL-restore semantics. */
  readonly initialPageIndex = input<number>(0);

  /** Page size choices offered in the paginator. */
  readonly pageSizeOptions = input<readonly number[]>([10, 25, 50, 100]);

  /**
   * Hides the column-chooser button in the toolbar. Default `true` because most call
   * sites use a curated column set; pages that want runtime customisation opt in.
   */
  readonly hideColumnChooser = input<boolean>(true);

  /** Hides the page-size selector dropdown while keeping the navigation arrows. */
  readonly hidePageSizeSelector = input<boolean>(false);

  /**
   * Active (committed) filter values, keyed by column key. The table pre-populates
   * the matching menu input from this map when the menu opens. Edits inside the menu
   * are staged locally and only emit through {@link columnFilterChange} when the user
   * clicks "Aceptar".
   */
  readonly columnFilters = input<ReadonlyMap<string, DataTableColumnFilterValue>>(new Map());

  /** Empty-state visuals rendered inside the body when the dataset is empty. */
  readonly emptyState = input<DataTableEmptyState | null>(null);

  /** Single-row selection toggle. */
  readonly selectable = input<boolean>(false);

  /** Two-way bound currently-selected row. */
  readonly selectedRow = model<T | null>(null);

  /** Switches the table from client-side mode (default) to server-side. */
  readonly serverSide = input<boolean>(false);

  /** Total rows in the dataset when `serverSide` is on. */
  readonly totalElements = input<number>(0);

  /** Fires when the user commits a sort change (either via Aceptar or a sort-only menu click). */
  readonly sortChange = output<DataTableSort | null>();

  /** Fires when the user navigates pages or changes the page size. */
  readonly pageChange = output<{ pageIndex: number; pageSize: number }>();

  /**
   * Fires when the user commits the column menu via Aceptar. Carries both the staged
   * filter value AND the staged sort direction in a single payload so the parent can
   * update the URL atomically — emitting two separate events (filter + sort) caused a
   * race on rapid `router.navigate` calls where the second call read a snapshot
   * before the first navigation had committed, dropping the earlier change.
   *
   * `filter === null` signals "filter cleared" for this column.
   * `sortDirection === ''` signals "no sort by this column"; non-empty means "use
   *  this column with the supplied direction". The parent decides whether to clear or
   * keep the current sort if it was active on a different column.
   */
  readonly columnMenuApply = output<{
    key: string;
    filter: DataTableColumnFilterValue | null;
    sortDirection: DataTableSortDirection;
  }>();

  /** Label of the trailing action column when an `actions` template is projected. */
  readonly actionsLabel = input<string>('Acciones');

  /** Row track-by accessor. Defaults to identity (Angular's default) when unset. */
  readonly trackBy = input<(index: number, row: T) => unknown>((_, row) => row);

  protected readonly effectiveTrackBy = (index: number, row: T): unknown =>
    this.trackBy()(index, row);

  /** Optional content-projected trailing column for row actions. */
  @ContentChild('actions', { read: TemplateRef })
  protected actionsTemplate: TemplateRef<{ $implicit: T }> | null = null;

  @ViewChild(MatPaginator) protected paginator?: MatPaginator;

  /** Committed sort state mirrored as a signal so the template reads it synchronously. */
  protected readonly sortState = signal<DataTableSort | null>(null);

  /** Currently visible column keys, in render order. */
  protected readonly visibleColumns = signal<readonly string[]>([]);

  /** Staged column-chooser selection — only commits on "Aplicar". */
  protected readonly draftVisibleColumns = signal<ReadonlySet<string>>(new Set());

  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(10);

  // --------------------------------------------------------------------------
  // Per-column menu staging — the heart of the touch-first interaction model.
  //
  // Each column has its own `FormControl` (or pair, for dateRange) that holds the
  // CURRENT staged value while the menu is open. The map indexes by key (text /
  // autocomplete) or `<key>:from` / `<key>:to` (dateRange). Staged values are NOT
  // committed automatically — the user must click "Aceptar" inside the menu, which
  // emits the change and closes the menu. Esc / outside-click discards the staged
  // state and resets it from the parent-owned `columnFilters` map on next open.
  // --------------------------------------------------------------------------
  protected readonly filterControls = new Map<string, FormControl<string | Date | null>>();

  /** Staged sort direction per column key; commits with the filter on Aceptar. */
  protected readonly stagedSort = new Map<string, DataTableSortDirection>();

  /** Active autocomplete option selected inside the menu (committed value + label). */
  protected readonly stagedAutocomplete = new Map<string, DataTableAutocompleteOption | null>();

  /** Reactive search text for autocomplete columns (drives filtered options list). */
  protected readonly autocompleteSearch = new Map<string, FormControl<string | null>>();

  /**
   * Reactive snapshots of the autocomplete search strings keyed by column. Using a
   * signal-of-map lets `filteredAutocompleteOptions()` re-compute when the user types
   * without us subscribing to every FormControl's valueChanges in the constructor.
   */
  protected readonly autocompleteSearchValues = signal<ReadonlyMap<string, string>>(new Map());

  /**
   * Sorted view over `data()`. Server-side mode renders as-is; client-side sorts
   * locally with locale-aware string comparison and nullish-last ordering.
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
   * Rows MatTable actually renders. No padding — the table is wrapped in a
   * fixed-height scroll container (~10 row heights) so the page footprint stays
   * stable while pageSize stays honest. With pageSize=20 the operator sees the
   * first ~10 rows and scrolls vertically inside the wrapper to reveal the rest.
   * When the dataset is empty AND `emptyState` is provided, the body renders
   * nothing and the sibling empty-state div fills the same reserved height.
   */
  protected readonly pagedData = computed<readonly T[]>(() => {
    if (this.showEmptyState()) {
      return [];
    }
    const all = this.sortedData();
    if (this.serverSide()) {
      return all;
    }
    return all.slice(this.pageIndex() * this.pageSize(), (this.pageIndex() + 1) * this.pageSize());
  });

  /** `true` when there are zero real rows AND an emptyState is configured. */
  protected readonly showEmptyState = computed<boolean>(() => {
    const realRowCount = this.serverSide() ? this.totalElements() : this.sortedData().length;
    return realRowCount === 0 && this.emptyState() !== null;
  });

  /** Paginator length: server-side uses totalElements, client-side uses sorted data length. */
  protected readonly paginatorLength = computed<number>(() =>
    this.serverSide() ? this.totalElements() : this.sortedData().length,
  );

  /** Full display order = visible config columns + action column when projected. */
  protected readonly displayedColumns = computed<readonly string[]>(() => {
    const visible = this.visibleColumns();
    return this.actionsTemplate ? [...visible, '__actions__'] : visible;
  });

  /** Columns the user can toggle from the chooser. */
  protected readonly hideableColumns = computed<readonly DataTableColumn<T>[]>(() =>
    this.columns().filter((c) => c.hideable !== false),
  );

  constructor() {
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
    this.paginator?.page.subscribe((event) => {
      this.pageIndex.set(event.pageIndex);
      this.pageSize.set(event.pageSize);
      this.pageChange.emit({ pageIndex: event.pageIndex, pageSize: event.pageSize });
    });
  }

  // --------------------------------------------------------------------------
  // Column-menu lifecycle hooks
  // --------------------------------------------------------------------------

  /**
   * Seeds the staged state for a column the moment its menu opens. Reads the active
   * filter from the parent-owned `columnFilters` map and the active sort from
   * `sortState`; the menu's form controls reflect those values when the user first
   * sees it. Discards any previous staged edits from a prior open-close cycle.
   */
  protected onColumnMenuOpen(column: DataTableColumn<T>): void {
    const filter = this.columnFilters().get(column.key);
    if (column.filter === 'text') {
      this.ensureControl(column.key).setValue(
        filter && filter.type === 'text' ? filter.value : '',
        { emitEvent: false },
      );
    } else if (column.filter === 'dateRange') {
      this.ensureControl(`${column.key}:from`).setValue(
        filter && filter.type === 'dateRange' ? parseIsoDate(filter.from) : null,
        { emitEvent: false },
      );
      this.ensureControl(`${column.key}:to`).setValue(
        filter && filter.type === 'dateRange' ? parseIsoDate(filter.to) : null,
        { emitEvent: false },
      );
    } else if (column.filter === 'autocomplete') {
      const search = this.ensureAutocompleteSearch(column.key);
      if (filter && filter.type === 'autocomplete') {
        search.setValue(filter.label, { emitEvent: false });
        this.stagedAutocomplete.set(column.key, { value: filter.value, label: filter.label });
      } else {
        search.setValue('', { emitEvent: false });
        this.stagedAutocomplete.set(column.key, null);
      }
      // Re-sync the signal so the filtered options recompute on open.
      this.autocompleteSearchValues.set(
        new Map(this.autocompleteSearchValues()).set(column.key, search.value ?? ''),
      );
    }
    // Sort staging: read current direction from sortState.
    const current = this.sortState();
    this.stagedSort.set(
      column.key,
      current && current.active === column.key ? current.direction : '',
    );
  }

  /**
   * Commits the staged state for a column in a single combined event so the parent
   * can update the URL atomically. Emitting separate filter + sort events caused a
   * race where back-to-back `router.navigate({ replaceUrl: true })` calls read the
   * route snapshot at the wrong moment and one of the two changes silently dropped.
   *
   * The local `sortState` signal is updated synchronously here too so the header's
   * sort indicator reflects the new direction the instant the menu closes.
   */
  protected onColumnMenuApply(column: DataTableColumn<T>): void {
    const filter = this.readStagedFilter(column);
    const direction = this.stagedSort.get(column.key) ?? '';

    // Mirror the new sort into the local signal so the header arrow flips
    // immediately (the parent will also push it through the URL → effect → table
    // input loop, but doing it locally avoids a frame of stale visual state).
    if (direction === '') {
      this.sortState.set(null);
    } else {
      this.sortState.set({ active: column.key, direction });
    }
    this.pageIndex.set(0);

    this.columnMenuApply.emit({
      key: column.key,
      filter,
      sortDirection: direction,
    });
  }

  /** Emits a sort change immediately — used by sort-only columns (no filter). */
  protected onColumnMenuSortOnlyApply(column: DataTableColumn<T>): void {
    this.commitSort(column);
  }

  /** Picks an autocomplete option in the staged state without committing. */
  protected onAutocompleteOptionSelect(
    column: DataTableColumn<T>,
    option: DataTableAutocompleteOption,
  ): void {
    this.stagedAutocomplete.set(column.key, option);
    // Mirror the label into the search box so the operator sees the picked label.
    this.ensureAutocompleteSearch(column.key).setValue(option.label, { emitEvent: false });
    this.autocompleteSearchValues.set(
      new Map(this.autocompleteSearchValues()).set(column.key, option.label),
    );
  }

  /** Clears the staged autocomplete selection from inside the menu. */
  protected onAutocompleteClear(column: DataTableColumn<T>): void {
    this.stagedAutocomplete.set(column.key, null);
    this.ensureAutocompleteSearch(column.key).setValue('', { emitEvent: false });
    this.autocompleteSearchValues.set(new Map(this.autocompleteSearchValues()).set(column.key, ''));
  }

  /** Wires the autocomplete search input to refresh the filtered list as the user types. */
  protected onAutocompleteSearchInput(column: DataTableColumn<T>, raw: string): void {
    this.autocompleteSearchValues.set(
      new Map(this.autocompleteSearchValues()).set(column.key, raw),
    );
    // Typing into the search box invalidates the prior selection if the label diverges.
    const staged = this.stagedAutocomplete.get(column.key);
    if (staged && staged.label !== raw) {
      this.stagedAutocomplete.set(column.key, null);
    }
  }

  /** Whether the column's staged filter should be exposed in the UI as "active". */
  protected hasActiveFilter(key: string): boolean {
    const value = this.columnFilters().get(key);
    if (!value) {
      return false;
    }
    if (value.type === 'text') {
      return value.value.length > 0;
    }
    if (value.type === 'autocomplete') {
      return value.value.length > 0;
    }
    return value.from !== null || value.to !== null;
  }

  /** Direction the column currently sorts by, or `''` when unsorted. */
  protected currentSortDirection(key: string): DataTableSortDirection {
    const current = this.sortState();
    return current && current.active === key ? current.direction : '';
  }

  /** Staged direction inside the menu (used to highlight the radio option). */
  protected stagedSortDirection(key: string): DataTableSortDirection {
    return this.stagedSort.get(key) ?? '';
  }

  /** Sets the staged sort direction for a column. */
  protected onStagedSortPick(column: DataTableColumn<T>, direction: DataTableSortDirection): void {
    this.stagedSort.set(column.key, direction);
  }

  // --------------------------------------------------------------------------
  // FormControl + lookup helpers
  // --------------------------------------------------------------------------

  protected ensureControl(key: string): FormControl<string | Date | null> {
    let control = this.filterControls.get(key);
    if (!control) {
      control = new FormControl<string | Date | null>('', { nonNullable: false });
      this.filterControls.set(key, control);
    }
    return control;
  }

  protected ensureAutocompleteSearch(key: string): FormControl<string | null> {
    let control = this.autocompleteSearch.get(key);
    if (!control) {
      control = new FormControl<string | null>('');
      this.autocompleteSearch.set(key, control);
    }
    return control;
  }

  protected textControl(key: string): FormControl<string | Date | null> {
    return this.ensureControl(key);
  }

  protected dateControl(key: string, end: 'from' | 'to'): FormControl<string | Date | null> {
    return this.ensureControl(`${key}:${end}`);
  }

  protected autocompleteSearchControl(key: string): FormControl<string | null> {
    return this.ensureAutocompleteSearch(key);
  }

  /**
   * Filtered list of autocomplete options for a column based on the menu's search
   * input. Returns `[]` until the user has typed at least `minSearchChars` (default 3)
   * so a freshly-opened menu does not dump the entire supplier catalog on screen.
   */
  protected filteredAutocompleteOptions(
    column: DataTableColumn<T>,
  ): readonly DataTableAutocompleteOption[] {
    if (column.filter !== 'autocomplete' || !column.autocomplete) {
      return [];
    }
    const minChars = column.autocomplete.minSearchChars ?? 3;
    const search = this.autocompleteSearchValues().get(column.key) ?? '';
    const normalised = search.trim().toLocaleLowerCase();
    if (normalised.length < minChars) {
      return [];
    }
    return column.autocomplete
      .options()
      .filter((opt) => opt.label.toLocaleLowerCase().includes(normalised))
      .slice(0, 8);
  }

  /** Staged autocomplete option for a column (drives the active-pill UI). */
  protected stagedAutocompleteFor(key: string): DataTableAutocompleteOption | null {
    return this.stagedAutocomplete.get(key) ?? null;
  }

  // --------------------------------------------------------------------------
  // Column-chooser draft + apply (unchanged from the previous iteration)
  // --------------------------------------------------------------------------

  protected onChooserOpen(): void {
    this.draftVisibleColumns.set(new Set(this.visibleColumns()));
  }

  protected onDraftToggle(key: string, checked: boolean): void {
    const next = new Set(this.draftVisibleColumns());
    if (checked) {
      next.add(key);
    } else {
      next.delete(key);
    }
    this.draftVisibleColumns.set(next);
  }

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

  protected onResetColumns(): void {
    this.visibleColumns.set(this.computeDefaultVisible());
    this.draftVisibleColumns.set(new Set(this.computeDefaultVisible()));
    this.sortState.set(this.initialSort());
    this.pageSize.set(this.initialPageSize());
    this.pageIndex.set(0);
  }

  protected isDraftChecked(key: string): boolean {
    return this.draftVisibleColumns().has(key);
  }

  protected readonly draftCount = computed(() => this.draftVisibleColumns().size);

  // --------------------------------------------------------------------------
  // Row selection (unchanged)
  // --------------------------------------------------------------------------

  protected onRowClick(row: T | null): void {
    if (!this.selectable() || row === null) {
      return;
    }
    this.selectedRow.update((current) => (current === row ? null : row));
  }

  protected rowClasses(row: T | null): string {
    if (!this.selectable() || row === null) {
      return '';
    }
    return this.selectedRow() === row
      ? 'cursor-pointer !bg-[var(--mat-sys-primary-container)] !text-[var(--mat-sys-on-primary-container)] font-medium'
      : 'cursor-pointer hover:!bg-[var(--mat-sys-surface-container-high)]';
  }

  // --------------------------------------------------------------------------
  // Internals
  // --------------------------------------------------------------------------

  /**
   * Reads the column's staged filter into the discriminated-union shape used in the
   * `columnMenuApply` payload. Pure read — no emission, no side effects — so the
   * caller can combine it with the staged sort in a single event. Empty text /
   * empty dateRange / unset autocomplete all map to `null` so the parent drops the
   * corresponding URL param.
   */
  private readStagedFilter(column: DataTableColumn<T>): DataTableColumnFilterValue | null {
    if (column.filter === 'text') {
      const raw = this.ensureControl(column.key).value;
      const value = typeof raw === 'string' ? raw.trim() : '';
      return value.length === 0 ? null : { type: 'text', value };
    }
    if (column.filter === 'dateRange') {
      const from = this.ensureControl(`${column.key}:from`).value;
      const to = this.ensureControl(`${column.key}:to`).value;
      const fromIso = from instanceof Date ? toIsoDate(from) : null;
      const toIso = to instanceof Date ? toIsoDate(to) : null;
      if (fromIso === null && toIso === null) {
        return null;
      }
      return { type: 'dateRange', from: fromIso, to: toIso };
    }
    if (column.filter === 'autocomplete') {
      const staged = this.stagedAutocomplete.get(column.key) ?? null;
      return staged === null
        ? null
        : { type: 'autocomplete', value: staged.value, label: staged.label };
    }
    return null;
  }

  /** Emits the staged sort direction for a column if it differs from the current. */
  private commitSort(column: DataTableColumn<T>): void {
    if (column.sortable === false) {
      return;
    }
    const next = this.stagedSort.get(column.key) ?? '';
    const current = this.sortState();
    const currentForColumn = current && current.active === column.key ? current.direction : '';
    if (next === currentForColumn) {
      return;
    }
    if (next === '') {
      this.sortState.set(null);
      this.sortChange.emit(null);
    } else {
      const sort: DataTableSort = { active: column.key, direction: next };
      this.sortState.set(sort);
      this.sortChange.emit(sort);
    }
    this.pageIndex.set(0);
    if (this.serverSide()) {
      this.pageChange.emit({ pageIndex: 0, pageSize: this.pageSize() });
    }
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

function toIsoDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
