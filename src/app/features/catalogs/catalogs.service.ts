import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, of, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { toQueryParams } from '../../core/api/http-helpers';
import type {
  City,
  DeathCause,
  Gender,
  Province,
  ReceiptType,
  Relationship,
  Role,
} from './catalogs.types';

/**
 * Single service for every read-only reference catalog the application consumes
 * (provinces, cities, genders, relationships, death causes, roles).
 *
 * <h3>Why one service instead of one per catalog</h3>
 *
 * Each catalog is tiny (3-30 entries), strictly read-only and seeded by Flyway. The
 * forms that consume them typically pull several at once (the affiliate form needs
 * gender, relationship and city together). Grouping them lets the service hold a
 * coordinated in-memory cache so the second visit to any form is instantaneous.
 *
 * <h3>Caching strategy</h3>
 *
 * Each catalog has its own signal. Once a catalog loads successfully, subsequent
 * `load*()` calls return the cached payload without hitting the network. Pass
 * `force: true` to bypass the cache (useful only if a backend operator edits the
 * underlying tables out-of-band, which is rare). Cities are cached per `provinceId`
 * because the backend filters server-side and the per-province lists are small but
 * disjoint.
 *
 * <h3>State surface</h3>
 *
 * Each catalog exposes a readonly signal of its data. There is no per-catalog
 * `loading` signal: catalog reads are fast (small payloads, server-side cache on the
 * backend via Caffeine — ADR-0006) and the page binds to the data signal and decides
 * its own loading UX. If you need fine-grained loading state per call, subscribe to
 * the returned `Observable` instead.
 */
@Injectable({ providedIn: 'root' })
export class CatalogsService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiBaseUrl;

  private readonly _provinces = signal<readonly Province[] | null>(null);
  private readonly _citiesByProvince = signal<ReadonlyMap<number, readonly City[]>>(new Map());
  private readonly _genders = signal<readonly Gender[] | null>(null);
  private readonly _relationships = signal<readonly Relationship[] | null>(null);
  private readonly _deathCauses = signal<readonly DeathCause[] | null>(null);
  private readonly _roles = signal<readonly Role[] | null>(null);
  private readonly _receiptTypes = signal<readonly ReceiptType[] | null>(null);

  /** Cached provinces or `null` before the first load. */
  readonly provinces = this._provinces.asReadonly();

  /** Map keyed by `provinceId`. Use {@link citiesFor} for the common case of one lookup. */
  readonly citiesByProvince = this._citiesByProvince.asReadonly();

  readonly genders = this._genders.asReadonly();
  readonly relationships = this._relationships.asReadonly();
  readonly deathCauses = this._deathCauses.asReadonly();
  readonly roles = this._roles.asReadonly();
  readonly receiptTypes = this._receiptTypes.asReadonly();

  /**
   * Returns a computed signal scoped to a single province's cities. The signal evaluates
   * to `null` when the cities for that province have not been loaded yet, mirroring the
   * `null` placeholder convention used by every other catalog field.
   */
  citiesFor(provinceId: number) {
    return computed<readonly City[] | null>(() => {
      const map = this._citiesByProvince();
      return map.get(provinceId) ?? null;
    });
  }

  loadProvinces(options: LoadOptions = {}): Observable<readonly Province[]> {
    const cached = this._provinces();
    if (cached && !options.force) {
      return of(cached);
    }
    return this.http
      .get<readonly Province[]>(`${this.baseUrl}/v1/provinces`)
      .pipe(tap((data) => this._provinces.set(data)));
  }

  loadCities(provinceId: number, options: LoadOptions = {}): Observable<readonly City[]> {
    const cached = this._citiesByProvince().get(provinceId);
    if (cached && !options.force) {
      return of(cached);
    }
    return this.http
      .get<readonly City[]>(`${this.baseUrl}/v1/cities`, {
        params: toQueryParams({ province_id: provinceId }),
      })
      .pipe(
        tap((data) => {
          const next = new Map(this._citiesByProvince());
          next.set(provinceId, data);
          this._citiesByProvince.set(next);
        }),
      );
  }

  loadGenders(options: LoadOptions = {}): Observable<readonly Gender[]> {
    return this.loadSimple(this._genders, 'genders', options);
  }

  loadRelationships(options: LoadOptions = {}): Observable<readonly Relationship[]> {
    return this.loadSimple(this._relationships, 'relationships', options);
  }

  loadDeathCauses(options: LoadOptions = {}): Observable<readonly DeathCause[]> {
    return this.loadSimple(this._deathCauses, 'death-causes', options);
  }

  loadRoles(options: LoadOptions = {}): Observable<readonly Role[]> {
    return this.loadSimple(this._roles, 'roles', options);
  }

  /**
   * Receipt types catalog. Backend endpoint uses camelCase (`/receiptTypes`)
   * unlike the other catalogs — see `ReceiptTypeController`. Kept as a one-
   * liner so the next developer doesn't go hunting for a special case.
   */
  loadReceiptTypes(options: LoadOptions = {}): Observable<readonly ReceiptType[]> {
    return this.loadSimple(this._receiptTypes, 'receiptTypes', options);
  }

  /** Wipes every cached catalog. Mostly useful in tests; production rarely needs this. */
  reset(): void {
    this._provinces.set(null);
    this._citiesByProvince.set(new Map());
    this._genders.set(null);
    this._relationships.set(null);
    this._deathCauses.set(null);
    this._roles.set(null);
    this._receiptTypes.set(null);
  }

  /**
   * Generic loader for the simple `{id, name}` catalogs. Keeps the public methods tiny
   * and one-liner so each catalog's signal + endpoint pair stays grepable from a single
   * function definition.
   */
  private loadSimple<T extends { id: number; name: string }>(
    target: ReturnType<typeof signal<readonly T[] | null>>,
    pathSegment: string,
    options: LoadOptions,
  ): Observable<readonly T[]> {
    const cached = target();
    if (cached && !options.force) {
      return of(cached);
    }
    return this.http
      .get<readonly T[]>(`${this.baseUrl}/v1/${pathSegment}`)
      .pipe(tap((data) => target.set(data)));
  }
}

/** Options accepted by every `load*()` call. */
export interface LoadOptions {
  /** When `true`, bypass the in-memory cache and refetch from the server. */
  readonly force?: boolean;
}
