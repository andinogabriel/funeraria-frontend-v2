/**
 * Public contract for {@link DataTableComponent} columns and persisted preferences.
 *
 * The component is intentionally data-driven (no per-column projection) because every
 * grid we ship has the same shape: a value accessor that doubles as the sort key and
 * the rendered display text, plus an optional trailing column for row actions provided
 * through a single template projection.
 *
 * Custom cell rendering for a column (badges, links, tooltips on a value) is handled
 * by `cellTemplate`; if absent, the component renders `column.value(row) | toString`.
 */
import type { TemplateRef } from '@angular/core';

/**
 * Per-column filter type opened from the header menu. Omit (leave `undefined`) when
 * the column should only expose sort options.
 *
 * - `'text'` — a single text input. Auto-applies on debounce; emits a
 *   {@link DataTableColumnFilterValue} of shape `{ type: 'text', value }`. The parent
 *   decides which backend param the value maps to (typically a multi-purpose `q`).
 * - `'dateRange'` — a pair of date pickers (Desde / Hasta). Emits a
 *   {@link DataTableColumnFilterValue} of shape `{ type: 'dateRange', from, to }`.
 *   Both ends are nullable so the user can filter open-ended in either direction.
 */
export type DataTableColumnFilterType = 'text' | 'dateRange';

/**
 * Discriminated union of column filter values. Matches the `filter` field declared on
 * the column; pages destructure on `type` to route into the right backend param.
 *
 * `null` in the inner fields means "no filter on this end" — the data-table emits
 * `null` (not a value with empty strings) through {@code columnFilterChange} when the
 * user clears the menu so the parent has a clean signal to drop the URL param.
 */
export type DataTableColumnFilterValue =
  | { readonly type: 'text'; readonly value: string }
  | {
      readonly type: 'dateRange';
      readonly from: string | null;
      readonly to: string | null;
    };

/** A sortable, hideable, optionally filterable column descriptor. */
export interface DataTableColumn<T> {
  /** Stable identifier — used as MatTable column id, sort key and persistence key. */
  readonly key: string;

  /** Header text. */
  readonly label: string;

  /**
   * Accessor used both for client-side sorting and as the default cell text. Return
   * `null`/`undefined` for "no value"; nullish entries sort last regardless of
   * direction so the user never has to wade past empty rows to reach data.
   */
  readonly value: (row: T) => string | number | Date | null | undefined;

  /** Optional custom cell renderer. Receives the row as `$implicit`. */
  readonly cellTemplate?: TemplateRef<{ $implicit: T }>;

  /** Whether the column participates in sorting. Defaults to `true`. */
  readonly sortable?: boolean;

  /**
   * Filter type opened from the column-header menu. Omit (or leave `undefined`) to
   * expose only sort options. The data-table renders the matching input inside the
   * menu and emits {@link DataTableColumnFilterValue} on debounce; the parent maps the
   * value to whichever backend param applies on that page.
   */
  readonly filter?: DataTableColumnFilterType;

  /**
   * Whether the user can hide the column through the column chooser. Defaults to
   * `true`. Action columns and primary identifiers (e.g. DNI) typically set this to
   * `false` so users cannot accidentally remove the only entry-point to a row.
   */
  readonly hideable?: boolean;

  /** Whether the column is visible by default before any user override applies. */
  readonly defaultVisible?: boolean;

  /** Extra class for the header cell. */
  readonly headerClass?: string;

  /** Extra class for the body cell. */
  readonly cellClass?: string;

  /** Alignment for both header and body cells. Defaults to `'start'`. */
  readonly align?: 'start' | 'end';
}

/** Sort direction supported by the table. `''` means "no sort". */
export type DataTableSortDirection = 'asc' | 'desc' | '';

/** Current sort state surfaced to the parent and used for persistence. */
export interface DataTableSort {
  readonly active: string;
  readonly direction: DataTableSortDirection;
}

/**
 * Empty-state visuals rendered inside the table body when {@code data.length === 0}.
 * The header + paginator stay visible so the user can still tap a column header to
 * adjust filters or navigate the (theoretical) other pages. The centered illustration
 * sits inside the fixed-height table viewport, not below it — that way the table's
 * footprint never shifts when a filter wipes the result set.
 */
export interface DataTableEmptyState {
  /** Material symbol icon name (e.g. `'receipt_long'`). */
  readonly icon: string;
  /** Title rendered under the icon; bold. */
  readonly title: string;
  /** Optional body paragraph; smaller, lighter. */
  readonly body?: string;
}

/**
 * Persisted preferences for a table identified by its `storageKey`. The shape is
 * versioned so a future migration can detect and migrate old payloads instead of
 * silently dropping them.
 */
export interface DataTablePreferences {
  readonly version: 1;
  readonly visibleColumns: readonly string[];
  readonly sort: DataTableSort | null;
  readonly pageSize: number;
}
