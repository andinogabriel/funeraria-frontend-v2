import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Item, ItemPage, ItemPageQuery, ItemRequest } from './item.types';

/**
 * CRUD client for the items catalog. Mirrors the plan/affiliate service shape:
 * signal-cached `list`, `Observable<T>` returns on each mutation. Writes refetch
 * the list on success so any other surface (the plan form picker) sees the change
 * without having to know about it.
 *
 * <h3>Natural key</h3>
 *
 * The backend uses the item's `code` (a free-text identifier the operator picks)
 * as the URL path variable for read-by-id, update, and delete. We pass it
 * through verbatim — no translation, no slug generation — because the operator
 * is the one who guarantees uniqueness when they enter it on the form.
 */
@Injectable({ providedIn: 'root' })
export class ItemService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/items`;

  private readonly _list = signal<readonly Item[] | null>(null);
  private readonly _page = signal<ItemPage | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly list = this._list.asReadonly();

  /** Latest paginated snapshot. `null` before the first {@link loadPage} call. */
  readonly page = this._page.asReadonly();

  /** Rows on the current page — convenience derived signal for templates. */
  readonly pageRows = computed<readonly Item[]>(() => this._page()?.content ?? []);

  /** Total elements across all pages — drives the paginator's `length`. */
  readonly totalElements = computed(() => this._page()?.totalElements ?? 0);

  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Fetches a paginated slice of items from the new server-side endpoint. Updates the
   * {@link page} signal on success and clears the error state. Lives on its own signal
   * (separate from {@link list}) so the list page can move to server-side without
   * disturbing the plan form picker that still consumes the full cached list.
   *
   * <p>Empty / null filter values are omitted from the URL entirely, so the backend's
   * empty-string sentinel pattern short-circuits the predicate.
   */
  loadPage(query: ItemPageQuery = {}): Observable<ItemPage> {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams();
    if (query.page !== undefined) params = params.set('page', String(query.page));
    if (query.limit !== undefined) params = params.set('limit', String(query.limit));
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDir) params = params.set('sortDir', query.sortDir);
    if (query.code && query.code.trim().length > 0) {
      params = params.set('code', query.code.trim());
    }
    if (query.name && query.name.trim().length > 0) {
      params = params.set('name', query.name.trim());
    }
    if (query.categoryName && query.categoryName.length > 0) {
      params = params.set('categoryName', query.categoryName);
    }
    if (query.brandName && query.brandName.length > 0) {
      params = params.set('brandName', query.brandName);
    }

    return this.http.get<ItemPage>(`${this.baseUrl}/paginated`, { params }).pipe(
      tap({
        next: (data) => {
          this._page.set(data);
          this._loading.set(false);
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this._loading.set(false);
          this._error.set(this.mapError(err));
        },
      }),
    );
  }

  /**
   * Optimistically removes a row from the cached paginated snapshot so the UI does not
   * have to wait for the next {@link loadPage} to drop the item the operator just
   * deleted. The subsequent reload reconciles totals + sort order with the server.
   */
  removeFromCachedPage(code: string): void {
    const current = this._page();
    if (current === null) {
      return;
    }
    const filtered = current.content.filter((row) => row.code !== code);
    if (filtered.length === current.content.length) {
      return;
    }
    this._page.set({
      ...current,
      content: filtered,
      totalElements: Math.max(0, current.totalElements - 1),
    });
  }

  /** Lists every item and updates the cached signal. */
  loadAll(): Observable<readonly Item[]> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<readonly Item[]>(this.baseUrl).pipe(
      tap({
        next: (data) => {
          this._list.set(data);
          this._loading.set(false);
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this._loading.set(false);
          this._error.set(this.mapError(err));
        },
      }),
    );
  }

  /** Returns the item with the given code from the cached list, or `undefined`. */
  findByCode(code: string): Item | undefined {
    return this._list()?.find((item) => item.code === code);
  }

  /**
   * Creates a new item. Patches the cache in place from the response payload —
   * no `GET /items` refetch — so any cached signal (notably the plan form
   * picker) sees the new row without a second round-trip.
   */
  create(request: ItemRequest): Observable<Item> {
    return this.http.post<Item>(this.baseUrl, request).pipe(
      tap((item) => {
        const current = this._list();
        if (current !== null) {
          this._list.set([...current, item]);
        }
      }),
    );
  }

  /**
   * Updates an item identified by its code. Replaces the row in the cached
   * list with the persisted response. The lookup uses `code` because that is
   * the natural key the operator can change other fields under (the id is
   * server-assigned and never changes).
   */
  update(code: string, request: ItemRequest): Observable<Item> {
    return this.http.put<Item>(`${this.baseUrl}/${encodeURIComponent(code)}`, request).pipe(
      tap((item) => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.map((i) => (i.code === code ? item : i)));
        }
      }),
    );
  }

  /** Deletes the item with the given code and removes it from the cached list. */
  delete(code: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(code)}`).pipe(
      tap(() => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.filter((i) => i.code !== code));
        }
      }),
    );
  }

  private mapError(err: { status?: number; error?: { detail?: string } }): string {
    const status = err.status ?? 0;
    if (status === 0) {
      return 'No se pudo contactar al servidor.';
    }
    if (status === 403) {
      return 'No tenés permiso para realizar esta acción sobre items.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar el catálogo de items.';
  }
}
