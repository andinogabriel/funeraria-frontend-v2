import { Injectable } from '@angular/core';

import type { DataTablePreferences } from './data-table.types';

/**
 * Thin localStorage wrapper for {@link DataTableComponent} preferences. Each table
 * passes its own `storageKey`; we add a stable prefix so the keys are easy to find in
 * DevTools and so a future "clear all table prefs" maintenance helper can match them
 * with a single string-startsWith filter.
 *
 * All read/write paths are defensive: a malformed payload (manual edit, a partial
 * migration, storage quota wipe) silently returns `null` so the table falls back to
 * defaults instead of crashing the page. We do NOT throw on JSON parse errors — the
 * user never asked us to validate their localStorage, they asked us to render a grid.
 */
@Injectable({ providedIn: 'root' })
export class TablePreferencesService {
  /** Prefix every key so DevTools shows them grouped and no other app picks them up. */
  private static readonly KEY_PREFIX = 'fnr.table.';

  /** Current persisted-payload version. Bump and add a migration when the shape changes. */
  private static readonly CURRENT_VERSION = 1 as const;

  /**
   * Loads preferences for `storageKey`. Returns `null` when nothing was persisted, the
   * payload is unreadable, or the version is unknown. Callers fall back to defaults.
   */
  load(storageKey: string): DataTablePreferences | null {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    const raw = window.localStorage.getItem(this.key(storageKey));
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as Partial<DataTablePreferences> | null;
      if (
        !parsed ||
        parsed.version !== TablePreferencesService.CURRENT_VERSION ||
        !Array.isArray(parsed.visibleColumns) ||
        typeof parsed.pageSize !== 'number'
      ) {
        return null;
      }
      return {
        version: TablePreferencesService.CURRENT_VERSION,
        visibleColumns: parsed.visibleColumns.filter((c): c is string => typeof c === 'string'),
        sort: parsed.sort ?? null,
        pageSize: parsed.pageSize,
      };
    } catch {
      return null;
    }
  }

  /** Saves preferences for `storageKey`. Silently no-ops if storage is unavailable. */
  save(storageKey: string, preferences: DataTablePreferences): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    try {
      window.localStorage.setItem(this.key(storageKey), JSON.stringify(preferences));
    } catch {
      // Quota exceeded or storage disabled in private mode — preferences are a
      // nice-to-have, not a correctness requirement.
    }
  }

  /** Clears persisted preferences for `storageKey`. */
  clear(storageKey: string): void {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    window.localStorage.removeItem(this.key(storageKey));
  }

  private key(storageKey: string): string {
    return `${TablePreferencesService.KEY_PREFIX}${storageKey}`;
  }
}
