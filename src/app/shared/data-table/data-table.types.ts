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
 * - `'text'` — single text input. The value is staged inside the menu; the user
 *   commits with the "Aceptar" button (no auto-debounce). Empty value = no filter.
 * - `'dateRange'` — pair of date pickers (Desde / Hasta). Both ends nullable for
 *   open-ended ranges.
 * - `'autocomplete'` — text input + suggestion list filtered from the column's
 *   `autocomplete.options()` source. The user must SELECT an option to commit a
 *   filter value (typing alone does nothing). Used for columns where the underlying
 *   backend filter is exact-match by id / nif and the suggestion list helps the
 *   operator find the right one.
 */
export type DataTableColumnFilterType = 'text' | 'dateRange' | 'autocomplete';

/**
 * Discriminated union of column filter values. Matches the `filter` field declared on
 * the column; pages destructure on `type` to route into the right backend param.
 *
 * `null` (returned through `columnFilterChange`) means "no filter on this column" — the
 * parent should drop the matching URL param.
 */
export type DataTableColumnFilterValue =
  | { readonly type: 'text'; readonly value: string }
  | {
      readonly type: 'dateRange';
      readonly from: string | null;
      readonly to: string | null;
    }
  | {
      readonly type: 'autocomplete';
      /** The committed option's `value` (e.g. supplier NIF). */
      readonly value: string;
      /** Human-readable label of the committed option (e.g. supplier name). */
      readonly label: string;
    };

/** Option rendered inside an autocomplete column menu. */
export interface DataTableAutocompleteOption {
  /** The opaque value committed as the column's filter (typically an id / nif). */
  readonly value: string;
  /** Human-readable label rendered in the suggestion list. */
  readonly label: string;
}

/**
 * Autocomplete config for a column with {@code filter: 'autocomplete'}. The component
 * calls `options()` to get the full set, then filters it client-side by the search
 * input once the user has typed at least `minSearchChars` characters (default 3).
 */
export interface DataTableAutocompleteConfig {
  /** Source of suggestions. Called every render — typically a closure over a signal. */
  readonly options: () => readonly DataTableAutocompleteOption[];
  /** Minimum chars before suggestions are revealed. Default: 3. */
  readonly minSearchChars?: number;
  /** Placeholder for the search input. Default: `'Buscar...'`. */
  readonly placeholder?: string;
}

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
   * expose only sort options. The data-table stages the value inside the menu and
   * commits it via the "Aceptar" button; the parent maps the value to whichever
   * backend param applies on that page.
   */
  readonly filter?: DataTableColumnFilterType;

  /**
   * Autocomplete configuration. Required when `filter === 'autocomplete'`; ignored
   * otherwise.
   */
  readonly autocomplete?: DataTableAutocompleteConfig;

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
 * Header columns + paginator stay visible (paginator disabled, header buttons
 * unclickable) so the table footprint never collapses on a filter wipe — only the
 * body cells are replaced by the centered illustration.
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
