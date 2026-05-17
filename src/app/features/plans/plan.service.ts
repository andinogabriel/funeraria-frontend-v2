import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Plan, PlanRequest } from './plan.types';

/**
 * Read + write client for the plan slice. Mirrors the affiliate service pattern from
 * ADR-0002: signal-based state plus `Observable<T>` returns so consumers pick the
 * ergonomics they prefer.
 *
 * <h3>State surface</h3>
 *
 * - {@link list} — cached plan list; `null` before the first load.
 * - {@link loading} / {@link error} — standard baseline signals.
 *
 * Writes (`create`, `update`, `delete`) patch the cached list in place from
 * the response payload (or filter on delete) instead of refetching the whole
 * collection — the operator-facing latency dropped meaningfully once we
 * stopped chasing every save with a redundant `GET /plans`.
 */
@Injectable({ providedIn: 'root' })
export class PlanService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/plans`;

  private readonly _list = signal<readonly Plan[] | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly list = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Lists every plan and updates the cached signal. */
  loadAll(): Observable<readonly Plan[]> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<readonly Plan[]>(this.baseUrl).pipe(
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

  /** Returns the plan with the given id from the cached list, or `undefined`. */
  findById(id: number): Plan | undefined {
    return this._list()?.find((plan) => plan.id === id);
  }

  /** Creates a new plan and appends it to the cached list. */
  create(request: PlanRequest): Observable<Plan> {
    return this.http.post<Plan>(this.baseUrl, request).pipe(
      tap((plan) => {
        const current = this._list();
        if (current !== null) {
          this._list.set([...current, plan]);
        }
      }),
    );
  }

  /** Updates an existing plan by id and replaces the cached row with the response. */
  update(id: number, request: PlanRequest): Observable<Plan> {
    return this.http.put<Plan>(`${this.baseUrl}/${id}`, request).pipe(
      tap((plan) => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.map((p) => (p.id === id ? plan : p)));
        }
      }),
    );
  }

  /** Deletes the plan with the given id and removes it from the cache. */
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`).pipe(
      tap(() => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.filter((p) => p.id !== id));
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
      return 'No tenés permiso para realizar esta acción sobre planes.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar los planes.';
  }
}
