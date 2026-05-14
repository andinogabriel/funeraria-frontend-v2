import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Brand, BrandRequest } from './brand.types';

/**
 * CRUD client for the brands catalog. Used both by the brands list page and by
 * the item form's brand picker. Mirrors the affiliate/plan service pattern:
 * signal-cached `list`, `Observable<T>` mutation returns, refetch on success.
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
    return this.http.post<Brand>(this.baseUrl, request).pipe(tap(() => this.loadAll().subscribe()));
  }

  update(id: number, request: BrandRequest): Observable<Brand> {
    return this.http
      .put<Brand>(`${this.baseUrl}/${id}`, request)
      .pipe(tap(() => this.loadAll().subscribe()));
  }

  delete(id: number): Observable<void> {
    return this.http
      .delete<void>(`${this.baseUrl}/${id}`)
      .pipe(tap(() => this.loadAll().subscribe()));
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
