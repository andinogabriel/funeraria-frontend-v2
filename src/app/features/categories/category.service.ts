import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Category, CategoryRequest } from './category.types';

/**
 * CRUD client for the categories catalog. Same shape as `BrandService`,
 * including the in-place cache patch on mutations (no refetch round-trip).
 */
@Injectable({ providedIn: 'root' })
export class CategoryService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/categories`;

  private readonly _list = signal<readonly Category[] | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly list = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  loadAll(): Observable<readonly Category[]> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<readonly Category[]>(this.baseUrl).pipe(
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

  findById(id: number): Category | undefined {
    return this._list()?.find((category) => category.id === id);
  }

  create(request: CategoryRequest): Observable<Category> {
    return this.http.post<Category>(this.baseUrl, request).pipe(
      tap((category) => {
        const current = this._list();
        if (current !== null) {
          this._list.set([...current, category]);
        }
      }),
    );
  }

  update(id: number, request: CategoryRequest): Observable<Category> {
    return this.http.put<Category>(`${this.baseUrl}/${id}`, request).pipe(
      tap((category) => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.map((c) => (c.id === id ? category : c)));
        }
      }),
    );
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.filter((c) => c.id !== id));
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
      return 'No tenés permiso para realizar esta acción sobre categorías.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar las categorías.';
  }
}
