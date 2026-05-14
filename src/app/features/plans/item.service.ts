import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { ItemRef } from './plan.types';

/**
 * Minimal read client for the items catalog (`/api/v1/items`). The plan form uses it to
 * populate the "add item to plan" picker. Lives inside the plan feature folder because
 * that is the only consumer today; if a second consumer appears (funerals, stock
 * dashboard) it should be promoted to `core/catalogs` next to the other reference
 * catalogs.
 *
 * Item catalog is small + rarely changes, so a single in-memory cache after the first
 * fetch is enough — no pagination, no filtering on the wire.
 */
@Injectable({ providedIn: 'root' })
export class ItemService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/items`;

  private readonly _list = signal<readonly ItemCatalogEntry[] | null>(null);
  private readonly _loading = signal(false);

  readonly list = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();

  /**
   * Fetches the items catalog. Subsequent calls re-fetch (no caching beyond signal
   * mirroring) so creating a plan that referenced a brand-new item sees it in the
   * picker after the catalog page added it.
   */
  loadAll(): Observable<readonly ItemCatalogEntry[]> {
    this._loading.set(true);
    return this.http.get<readonly ItemCatalogEntry[]>(this.baseUrl).pipe(
      tap({
        next: (data) => {
          this._list.set(data);
          this._loading.set(false);
        },
        error: () => this._loading.set(false),
      }),
    );
  }
}

/**
 * Wire-format item as the catalog endpoint serialises it. The plan form only needs
 * `id` + `name` + `code` + `price` from this shape — the rest (stock, dimensions,
 * category, brand) lives on the item-catalog screens that this service is too thin
 * to know about.
 */
export interface ItemCatalogEntry extends ItemRef {
  readonly id: number;
}
