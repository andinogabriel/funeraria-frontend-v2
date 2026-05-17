import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Supplier, SupplierRequest } from './supplier.types';

/**
 * CRUD client for the suppliers (proveedores) catalog. Admin-only on the backend (every
 * route is gated by `hasRole('ADMIN')`); the sidebar entry also requires ROLE_ADMIN so a
 * regular USER never gets to call this service — if they do, the friendly 403 message
 * surfaces in the error signal.
 *
 * <h3>Natural key</h3>
 *
 * Suppliers are addressed by `nif` (tax id) on the backend — every path variable + the
 * unique constraint live on that column. The service treats it as the immutable identifier
 * once a supplier is saved (parallel to `code` on items).
 *
 * <h3>Cache strategy</h3>
 *
 * Same in-place patch pattern as brand / category / item / plan: mutations update the
 * cached signal from the response payload instead of refetching the whole list. If the
 * cache is `null` (no prior load) we skip the patch and let the next `loadAll()` hydrate.
 */
@Injectable({ providedIn: 'root' })
export class SupplierService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/suppliers`;

  private readonly _list = signal<readonly Supplier[] | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly list = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  loadAll(): Observable<readonly Supplier[]> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<readonly Supplier[]>(this.baseUrl).pipe(
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

  /** Looks up a supplier by `nif` from the cached list, or `undefined`. */
  findByNif(nif: string): Supplier | undefined {
    return this._list()?.find((supplier) => supplier.nif === nif);
  }

  create(request: SupplierRequest): Observable<Supplier> {
    return this.http.post<Supplier>(this.baseUrl, request).pipe(
      tap((supplier) => {
        const current = this._list();
        if (current !== null) {
          this._list.set([...current, supplier]);
        }
      }),
    );
  }

  update(nif: string, request: SupplierRequest): Observable<Supplier> {
    return this.http.put<Supplier>(`${this.baseUrl}/${encodeURIComponent(nif)}`, request).pipe(
      tap((supplier) => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.map((s) => (s.nif === nif ? supplier : s)));
        }
      }),
    );
  }

  delete(nif: string): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${encodeURIComponent(nif)}`).pipe(
      tap(() => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.filter((s) => s.nif !== nif));
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
      return 'No tenés permiso para administrar proveedores.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar los proveedores.';
  }
}
