import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { toQueryParams } from '../../core/api/http-helpers';
import type { Affiliate, AffiliateRequest } from './affiliate.types';

/**
 * Read + write client for the affiliate slice. Follows the pattern from ADR-0002:
 * signal-based state plus `Observable<T>` returns from each call so consumers can pick
 * the ergonomics they prefer.
 *
 * <h3>Date normalisation</h3>
 *
 * The backend returns `birthDate` and `startDate` as `dd-MM-yyyy` strings (legacy
 * display format) but accepts `yyyy-MM-dd` in request bodies. This service is the only
 * place that translation lives — everywhere else in the app (form state, table cells,
 * comparisons) deals with ISO `yyyy-MM-dd` exclusively. Adding more date fields? Extend
 * {@link AffiliateService#normalizeAffiliate} and the tests pin the contract.
 *
 * <h3>State surface</h3>
 *
 * - {@link list} — cached active affiliates (`deceased = false`); `null` before the
 *   first load.
 * - {@link loading} / {@link error} — standard baseline signals.
 *
 * Writes patch the cached signal in place from the response payload (filter on
 * delete) instead of refetching the whole active list — same approach as the
 * brand / category / item / plan services. Mutations cost one round-trip, not
 * two, and the table no longer flickers between optimistic state and refetch.
 * If the cache is `null` (no prior `loadActive()`) we skip the patch; the next
 * caller of `loadActive()` will hydrate it from scratch.
 */
@Injectable({ providedIn: 'root' })
export class AffiliateService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/affiliates`;

  private readonly _list = signal<readonly Affiliate[] | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly list = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** `true` once a successful load has produced an empty list. */
  readonly empty = computed(() => {
    const value = this._list();
    return value !== null && value.length === 0;
  });

  /** Lists active affiliates (`deceased = false`) and updates the cached signal. */
  loadActive(): Observable<readonly Affiliate[]> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<readonly AffiliateWire[]>(this.baseUrl).pipe(
      map((wire) => wire.map((entry) => this.normalizeAffiliate(entry))),
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

  /**
   * Looks up a single affiliate by DNI from the cached list. Used by the edit page to
   * pre-populate the form. Returns `undefined` when the list is not loaded or the DNI
   * is absent; the caller is responsible for triggering a load first.
   */
  findByDni(dni: number): Affiliate | undefined {
    return this._list()?.find((affiliate) => affiliate.dni === dni);
  }

  /**
   * Searches affiliates by name / surname / DNI. Hits the backend's `/search` endpoint
   * directly; does not mutate the cached list (the search is a different result set,
   * not a refinement of the active list). Returns the normalised affiliates so callers
   * can render them with the same template as the cached list.
   */
  search(value: string): Observable<readonly Affiliate[]> {
    const params = toQueryParams({ value });
    return this.http
      .get<readonly AffiliateWire[]>(`${this.baseUrl}/search`, { params })
      .pipe(map((wire) => wire.map((entry) => this.normalizeAffiliate(entry))));
  }

  /** Creates a new affiliate and appends it to the cached active list. */
  create(request: AffiliateRequest): Observable<Affiliate> {
    return this.http.post<AffiliateWire>(this.baseUrl, request).pipe(
      map((wire) => this.normalizeAffiliate(wire)),
      tap((affiliate) => {
        const current = this._list();
        if (current !== null && !affiliate.deceased) {
          this._list.set([...current, affiliate]);
        }
      }),
    );
  }

  /**
   * Updates an affiliate identified by DNI and patches the cached row from the
   * response. If the update flips `deceased` to `true` the row drops out of the
   * active list, since `loadActive()` only ships `deceased = false`.
   */
  update(dni: number, request: AffiliateRequest): Observable<Affiliate> {
    return this.http.put<AffiliateWire>(`${this.baseUrl}/${dni}`, request).pipe(
      map((wire) => this.normalizeAffiliate(wire)),
      tap((affiliate) => {
        const current = this._list();
        if (current === null) {
          return;
        }
        if (affiliate.deceased) {
          this._list.set(current.filter((a) => a.dni !== dni));
          return;
        }
        this._list.set(current.map((a) => (a.dni === dni ? affiliate : a)));
      }),
    );
  }

  /** Deletes the affiliate identified by DNI and removes it from the cache. */
  delete(dni: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${dni}`).pipe(
      tap(() => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.filter((a) => a.dni !== dni));
        }
      }),
    );
  }

  /**
   * Translates the legacy `dd-MM-yyyy` strings the backend ships back to ISO
   * `yyyy-MM-dd`, leaving the rest of the payload untouched. Kept as a static-shaped
   * pure helper so it is trivially testable.
   */
  private normalizeAffiliate(wire: AffiliateWire): Affiliate {
    return {
      firstName: wire.firstName,
      lastName: wire.lastName,
      dni: wire.dni,
      birthDate: toIsoDate(wire.birthDate),
      startDate: toIsoDate(wire.startDate),
      deceased: wire.deceased,
      gender: wire.gender,
      relationship: wire.relationship,
    };
  }

  private mapError(err: { status?: number; error?: { detail?: string } }): string {
    const status = err.status ?? 0;
    if (status === 0) {
      return 'No se pudo contactar al servidor.';
    }
    if (status === 403) {
      return 'No tenés permiso para ver el listado de afiliados.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar afiliados.';
  }
}

/**
 * Wire-format affiliate as the backend serialises it. Lives inside the service file
 * because no other layer should ever see the legacy date format — public callers see
 * the normalised {@link Affiliate} type only.
 */
interface AffiliateWire {
  readonly firstName: string;
  readonly lastName: string;
  readonly dni: number;
  /** `dd-MM-yyyy` per the backend's legacy format. */
  readonly birthDate: string;
  /** `dd-MM-yyyy` per the backend's legacy format. */
  readonly startDate: string;
  readonly deceased: boolean;
  readonly gender: Affiliate['gender'];
  readonly relationship: Affiliate['relationship'];
}

/**
 * Converts the backend's `dd-MM-yyyy` to ISO `yyyy-MM-dd`. Returns the input unchanged
 * when it already looks ISO so the function is idempotent — callers passing already-
 * normalised data (in tests, future endpoints) do not double-flip the format.
 */
function toIsoDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!match) {
    return value;
  }
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}
