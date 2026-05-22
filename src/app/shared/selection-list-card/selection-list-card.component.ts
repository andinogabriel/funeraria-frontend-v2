import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  signal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

import {
  DataTableComponent,
  type DataTableColumn,
  type DataTableColumnFilterValue,
  type DataTableEmptyState,
  type DataTableSort,
} from '../data-table';
import type { ListCardAction } from './selection-list-card.types';

/**
 * Re-usable list-page card. Encapsulates the pattern that has shipped on every
 * CRUD surface so far (suppliers / brands / categories / plans / affiliates /
 * items / funerals): a `mat-card` with a responsive action toolbar on top of a
 * {@link DataTableComponent} in client-side mode. Loading / empty / has-data
 * branches share the data-table's fixed ~10-row footprint so the card never
 * visibly resizes between states.
 *
 * <h3>Filtering</h3>
 *
 * Filtering is per-column: the operator opens a column header to access the
 * filter input (text / dateRange) for that column and commits via Aceptar.
 * This component owns the committed-filter state internally; the parent only
 * needs to declare `filter: 'text' | 'dateRange'` on whichever columns should
 * be filterable. The page does NOT do any filtering work — the wrapper applies
 * the committed filters in memory before forwarding the rows to the data-table.
 *
 * <p>(The legacy top-bar global search was removed in favour of column-scoped
 * filters because they are less ambiguous: "match this exact column" instead
 * of "match anywhere in any field".)
 *
 * <h3>What the parent owns</h3>
 *
 * - The action list and their handlers — declarative array (icon, label,
 *   tooltip, disabled, handler).
 * - The selection — two-way bound through `[(selectedRow)]`. The wrapper
 *   automatically clears the selection when the picked row drops out of the
 *   filtered view (e.g. after a filter commit) so action buttons stay honest.
 * - The empty-state copy.
 *
 * <h3>What this component owns</h3>
 *
 * - The committed per-column filter map and the in-memory filtering pass.
 * - The responsive action toolbar (icon-only mobile vs stroked-with-label
 *   desktop).
 */
@Component({
  selector: 'app-selection-list-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, MatButtonModule, MatCardModule, MatIconModule, MatTooltipModule],
  templateUrl: './selection-list-card.component.html',
  styleUrl: './selection-list-card.component.scss',
})
export class SelectionListCardComponent<T> {
  /** Rows to render — unfiltered. The wrapper applies committed filters internally. */
  readonly data = input.required<readonly T[]>();

  /** Column definitions forwarded to the inner DataTable. */
  readonly columns = input.required<readonly DataTableColumn<T>[]>();

  /** Track-by accessor forwarded to the inner DataTable. */
  readonly trackBy = input<(index: number, row: T) => unknown>((_, row) => row);

  /** Persistence key for the inner DataTable's user preferences. */
  readonly storageKey = input<string | undefined>(undefined);

  /** Initial sort applied before any persisted preference. */
  readonly initialSort = input<DataTableSort | null>(null);

  /** True while data is still being fetched on the first call. */
  readonly loading = input<boolean>(false);

  /** Copy + iconography for the empty-state branch. */
  readonly emptyIcon = input<string>('search_off');
  readonly emptyTitle = input<string>('No hay resultados.');
  readonly emptyHint = input<string>('Probá con otro criterio de búsqueda.');

  /** Toolbar action descriptors. Rendered in two presentations (mobile / desktop). */
  readonly actions = input<readonly ListCardAction[]>([]);

  /** Two-way bound currently-selected row. */
  readonly selectedRow = model<T | null>(null);

  /**
   * Committed per-column filter map. The data-table emits `columnMenuApply` when
   * the operator hits Aceptar; we update this signal, recompute `filteredData`,
   * and forward the new view to the table. The data-table itself remains
   * stateless about the dataset — it pre-populates its own staged inputs from
   * this map every time a menu opens.
   */
  protected readonly committedFilters = signal<ReadonlyMap<string, DataTableColumnFilterValue>>(
    new Map(),
  );

  /**
   * Empty-state payload forwarded to the data-table. Built from the
   * `emptyIcon` / `emptyTitle` / `emptyHint` inputs so the same icon + copy the
   * wrapper used to render externally now lives inside the table viewport.
   */
  protected readonly effectiveEmptyState = computed<DataTableEmptyState>(() => ({
    icon: this.emptyIcon(),
    title: this.emptyTitle(),
    body: this.emptyHint(),
  }));

  /**
   * Filtered slice of `data`, after applying every committed filter. Implemented
   * as a single in-memory pass — every column carrying a `filter` declaration
   * gets the matching filter applied via {@link rowMatchesFilter}. Columns with
   * no filter declaration ignore the map entirely so a stale entry never hides
   * rows by accident.
   */
  protected readonly filteredData = computed<readonly T[]>(() => {
    const filters = this.committedFilters();
    if (filters.size === 0) {
      return this.data();
    }
    const columns = this.columns();
    return this.data().filter((row) =>
      columns.every((column) => {
        const filter = filters.get(column.key);
        if (!filter) {
          return true;
        }
        return rowMatchesFilter(column.value(row), filter);
      }),
    );
  });

  constructor() {
    // If the operator commits a filter that excludes the currently selected
    // row, drop the selection so the action buttons that depend on it reflect
    // reality. We compare by reference because the wrapper's `data` input is
    // canonical — every page passes the same row object instances on every
    // render through identity-preserving signals.
    effect(() => {
      const selected = this.selectedRow();
      if (selected === null) {
        return;
      }
      const visible = this.filteredData();
      if (!visible.includes(selected)) {
        this.selectedRow.set(null);
      }
    });
  }

  /** Updates the committed-filter map when the data-table fires `columnMenuApply`. */
  protected onColumnMenuApply(event: {
    key: string;
    filter: DataTableColumnFilterValue | null;
  }): void {
    const next = new Map(this.committedFilters());
    if (event.filter === null) {
      next.delete(event.key);
    } else {
      next.set(event.key, event.filter);
    }
    this.committedFilters.set(next);
  }
}

/**
 * Matches a single row value against a committed column filter. Pure function
 * so the filter pipeline reads as a flat `.every()` chain.
 *
 * <ul>
 *   <li>`text` — case-insensitive, diacritic-insensitive substring match against
 *       the row's stringified value.</li>
 *   <li>`dateRange` — parses the value as a `Date` and checks inclusive bounds.
 *       Either end may be open. Returns `false` if the value cannot be parsed.</li>
 *   <li>`autocomplete` — exact string match against the option's `value`.
 *       Client-side autocomplete is unusual but supported for completeness.</li>
 * </ul>
 */
function rowMatchesFilter(
  rawValue: string | number | Date | null | undefined,
  filter: DataTableColumnFilterValue,
): boolean {
  if (filter.type === 'text') {
    if (filter.value === '') {
      return true;
    }
    if (rawValue === null || rawValue === undefined) {
      return false;
    }
    const haystack = foldDiacritics(String(rawValue)).toLowerCase();
    const needle = foldDiacritics(filter.value).toLowerCase();
    return haystack.includes(needle);
  }
  if (filter.type === 'dateRange') {
    if (filter.from === null && filter.to === null) {
      return true;
    }
    if (rawValue === null || rawValue === undefined) {
      return false;
    }
    const asDate = rawValue instanceof Date ? rawValue : new Date(String(rawValue));
    if (Number.isNaN(asDate.getTime())) {
      return false;
    }
    if (filter.from !== null && asDate < new Date(filter.from)) {
      return false;
    }
    if (filter.to !== null && asDate > new Date(filter.to)) {
      return false;
    }
    return true;
  }
  // autocomplete: exact string match against the picked option's value.
  if (rawValue === null || rawValue === undefined) {
    return false;
  }
  return String(rawValue) === filter.value;
}

function foldDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
