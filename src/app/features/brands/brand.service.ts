import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Brand, BrandRequest } from './brand.types';

/**
 * CRUD client for the brands catalog. Used both by the brands list page and by
 * the item form's brand picker. Signal-cached `list`, `Observable<T>` mutation
 * returns.
 *
 * <h3>Cache strategy</h3>
 *
 * Mutations patch the cached signal in place from the response payload instead
 * of refetching the whole list. The backend's POST/PUT already return the
 * persisted entity (with server-side fields like `id`), and DELETE just needs a
 * local filter — so a full `GET /brands` round-trip after every save was pure
 * waste (doubled requests, list flicker, latency the operator could feel). If
 * the cache is `null` (no prior load) we skip the patch and let the next
 * explicit `loadAll()` hydrate it from scratch.
 */
@Injectable({ providedIn: 'root' })
export class BrandService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/brands`;

  private readonly _list = signal<readonly Brand[] | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly list = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  loadAll(): Observable<readonly Brand[]> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<readonly Brand[]>(this.baseUrl).pipe(
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

  findById(id: number): Brand | undefined {
    return this._list()?.find((brand) => brand.id === id);
  }

  create(request: BrandRequest): Observable<Brand> {
    return this.http.post<Brand>(this.baseUrl, request).pipe(
      tap((brand) => {
        const current = this._list();
        if (current !== null) {
          this._list.set([...current, brand]);
        }
      }),
    );
  }

  update(id: number, request: BrandRequest): Observable<Brand> {
    return this.http.put<Brand>(`${this.baseUrl}/${id}`, request).pipe(
      tap((brand) => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.map((b) => (b.id === id ? brand : b)));
        }
      }),
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.filter((b) => b.id !== id));
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
      return 'No tenés permiso para realizar esta acción sobre marcas.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar las marcas.';
  }
}
