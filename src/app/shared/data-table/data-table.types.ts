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

/** A sortable, hideable column descriptor for {@link DataTableComponent}. */
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
