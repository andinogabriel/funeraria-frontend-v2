import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Plan, PlanBinPageQuery, PlanPage, PlanRequest } from './plan.types';

/**
 * Read + write client for the plan slice. Mirrors the affiliate service pattern from
 * ADR-0002: signal-based state plus `Observable<T>` returns so consumers pick the
 * ergonomics they prefer.
 *
 * <h3>State surface</h3>
 *
 * - {@link list} — cached active plan list; `null` before the first load. Soft-
 *   deleted plans are filtered out server-side; this signal never carries them.
 * - {@link loading} / {@link error} — standard baseline signals.
 * - {@link binRows} / {@link binTotalElements} / {@link binLoading} /
 *   {@link binError} / {@link binFetchedAt} — separate state for the admin-only
 *   papelera surface so it never clobbers the active-list cache (same split the
 *   funeral / affiliate services use).
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

  // Papelera-side cache, completely separate from the active-list cache so a
  // refresh of one never invalidates the other.
  private readonly _binPage = signal<PlanPage | null>(null);
  private readonly _binLoading = signal(false);
  private readonly _binError = signal<string | null>(null);
  private readonly _binFetchedAt = signal<Date | null>(null);

  readonly binRows = computed<readonly Plan[]>(() => this._binPage()?.content ?? []);
  readonly binTotalElements = computed(() => this._binPage()?.totalElements ?? 0);
  readonly binLoading = this._binLoading.asReadonly();
  readonly binError = this._binError.asReadonly();
  readonly binFetchedAt = this._binFetchedAt.asReadonly();

  /** Lists every active plan and updates the cached signal. */
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

  /**
   * Soft-deletes the plan with the given id and removes it from the active-list
   * cache. The backend stamps `deletedAt` + `deletedBy` on the row; the regular
   * listing endpoints filter it out, so a follow-up `loadAll` would also drop
   * it. We patch the cache locally so the UI updates without an extra round-trip.
   */
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

  /**
   * Filtered + paginated read of soft-deleted plans from
   * `GET /api/v1/plans/deleted` (admin only). Updates the dedicated
   * {@link binRows} / {@link binTotalElements} signals — separate from the
   * active-list cache so the two surfaces never clobber each other.
   *
   * <p>Filter params follow the empty-string sentinel pattern: the backend
   * treats an absent param as "no filter", so we drop blank values entirely
   * to keep the URL clean.
   */
  loadDeletedPage(query: PlanBinPageQuery = {}): Observable<PlanPage> {
    this._binLoading.set(true);
    this._binError.set(null);

    let params = new HttpParams();
    if (query.page !== undefined) params = params.set('page', String(query.page));
    if (query.limit !== undefined) params = params.set('limit', String(query.limit));
    if (query.name && query.name.trim().length > 0) {
      params = params.set('name', query.name.trim());
    }
    if (query.deletedBy && query.deletedBy.trim().length > 0) {
      params = params.set('deletedBy', query.deletedBy.trim());
    }
    if (query.deletedFrom) params = params.set('deletedFrom', query.deletedFrom);
    if (query.deletedTo) params = params.set('deletedTo', query.deletedTo);

    return this.http.get<PlanPage>(`${this.baseUrl}/deleted`, { params }).pipe(
      map((wire) => ({
        content: wire.content,
        totalElements: wire.totalElements,
        totalPages: wire.totalPages,
        size: wire.size,
        number: wire.number,
        first: wire.first,
        last: wire.last,
      })),
      tap({
        next: (data) => {
          this._binPage.set(data);
          this._binFetchedAt.set(new Date());
          this._binLoading.set(false);
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this._binLoading.set(false);
          this._binError.set(this.mapError(err));
          this._binFetchedAt.set(null);
        },
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
