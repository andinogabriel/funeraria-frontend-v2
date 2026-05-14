import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Item, ItemRequest } from './item.types';

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
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly list = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

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

  /** Creates a new item. Refetches the list on success. */
  create(request: ItemRequest): Observable<Item> {
    return this.http.post<Item>(this.baseUrl, request).pipe(tap(() => this.loadAll().subscribe()));
  }

  /** Updates an item identified by its code. */
  update(code: string, request: ItemRequest): Observable<Item> {
    return this.http
      .put<Item>(`${this.baseUrl}/${encodeURIComponent(code)}`, request)
      .pipe(tap(() => this.loadAll().subscribe()));
  }

  /** Deletes the item with the given code. */
  delete(code: string): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/${encodeURIComponent(code)}`)
      .pipe(tap(() => this.loadAll().subscribe()));
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
