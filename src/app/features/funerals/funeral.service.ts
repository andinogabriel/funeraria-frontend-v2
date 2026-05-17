import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  AddressResponse,
  DeceasedResponse,
  DeceasedUser,
  Funeral,
  FuneralPlanResponse,
  FuneralRequest,
} from './funeral.types';
import type { DeathCause, Gender, ReceiptType, Relationship } from '../catalogs/catalogs.types';

/**
 * Read + write client for the funeral (servicio) slice. Same shape as the
 * other CRUD services (signal-cached `list`, `Observable<T>` returns) with
 * the in-place cache patch pattern: mutations update the cached signal from
 * the response payload instead of refetching the whole list.
 *
 * <h3>Date normalisation</h3>
 *
 * The backend ships `funeralDate` / `registerDate` as `dd-MM-yyyy HH:mm`
 * and `deceased.birthDate` / `deceased.deathDate` as `dd-MM-yyyy`. This
 * service is the only place that translation lives — every other layer of
 * the app (form state, table cells, dialogs) deals exclusively in ISO
 * formats. See {@link normalizeFuneral} for the field-by-field translation.
 */
@Injectable({ providedIn: 'root' })
export class FuneralService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/funerals`;

  private readonly _list = signal<readonly Funeral[] | null>(null);
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

  /** Lists every funeral (ADMIN-only on the backend). */
  loadAll(): Observable<readonly Funeral[]> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<readonly FuneralWire[]>(this.baseUrl).pipe(
      map((wire) => wire.map((entry) => normalizeFuneral(entry))),
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

  findById(id: number): Funeral | undefined {
    return this._list()?.find((funeral) => funeral.id === id);
  }

  create(request: FuneralRequest): Observable<Funeral> {
    return this.http.post<FuneralWire>(this.baseUrl, request).pipe(
      map((wire) => normalizeFuneral(wire)),
      tap((funeral) => {
        const current = this._list();
        if (current !== null) {
          this._list.set([...current, funeral]);
        }
      }),
    );
  }

  update(id: number, request: FuneralRequest): Observable<Funeral> {
    return this.http.put<FuneralWire>(`${this.baseUrl}/${id}`, request).pipe(
      map((wire) => normalizeFuneral(wire)),
      tap((funeral) => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.map((f) => (f.id === id ? funeral : f)));
        }
      }),
    );
  }

  /**
   * Deletes the funeral identified by `id`. The backend returns an
   * `OperationStatusModel` payload but we ignore the body — the cache
   * filter is the source of truth in-memory.
   */
  delete(id: number): Observable<void> {
    return this.http.delete<unknown>(`${this.baseUrl}/${id}`).pipe(
      map(() => undefined),
      tap(() => {
        const current = this._list();
        if (current !== null) {
          this._list.set(current.filter((f) => f.id !== id));
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
      return 'No tenés permiso para ver el listado de servicios.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar los servicios.';
  }
}

/* -------------------------------------------------------------------------- */
/*                              Wire-format types                             */
/* -------------------------------------------------------------------------- */

/**
 * Funeral as the backend serialises it. Lives inside the service file because
 * no other layer should ever see the legacy date format — public callers see
 * the normalised {@link Funeral} type only.
 */
interface FuneralWire {
  readonly id: number;
  /** `dd-MM-yyyy HH:mm`. */
  readonly funeralDate: string;
  /** `dd-MM-yyyy HH:mm`. */
  readonly registerDate: string;
  readonly receiptNumber: string | null;
  readonly receiptSeries: string | null;
  readonly tax: number | null;
  readonly totalAmount: number;
  readonly receiptType: ReceiptType | null;
  readonly deceased: DeceasedWire;
  readonly plan: FuneralPlanResponse;
}

interface DeceasedWire {
  readonly id: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly dni: number;
  readonly affiliated?: boolean;
  /** `dd-MM-yyyy`. */
  readonly birthDate: string;
  /** `dd-MM-yyyy`. */
  readonly deathDate: string;
  /** `dd-MM-yyyy HH:mm`. */
  readonly registerDate?: string;
  readonly placeOfDeath?: AddressResponse | null;
  readonly gender: Gender;
  readonly deceasedRelationship: Relationship;
  readonly deathCause: DeathCause;
  readonly deceasedUser?: DeceasedUser | null;
}

/* -------------------------------------------------------------------------- */
/*                            Normalisation helpers                           */
/* -------------------------------------------------------------------------- */

/**
 * Translates a wire-format funeral into the application-facing {@link Funeral}
 * shape — same fields, ISO dates. Pure / static-shaped so the service stays
 * trivially testable.
 */
function normalizeFuneral(wire: FuneralWire): Funeral {
  return {
    id: wire.id,
    funeralDate: toIsoDateTime(wire.funeralDate),
    registerDate: toIsoDateTime(wire.registerDate),
    receiptNumber: wire.receiptNumber,
    receiptSeries: wire.receiptSeries,
    tax: wire.tax,
    totalAmount: wire.totalAmount,
    receiptType: wire.receiptType,
    deceased: normalizeDeceased(wire.deceased),
    plan: wire.plan,
  };
}

function normalizeDeceased(wire: DeceasedWire): DeceasedResponse {
  return {
    id: wire.id,
    firstName: wire.firstName,
    lastName: wire.lastName,
    dni: wire.dni,
    affiliated: wire.affiliated ?? false,
    birthDate: toIsoDate(wire.birthDate),
    deathDate: toIsoDate(wire.deathDate),
    registerDate: wire.registerDate ? toIsoDateTime(wire.registerDate) : '',
    placeOfDeath: wire.placeOfDeath ?? null,
    gender: wire.gender,
    deceasedRelationship: wire.deceasedRelationship,
    deathCause: wire.deathCause,
    deceasedUser: wire.deceasedUser ?? null,
  };
}

/**
 * Converts `dd-MM-yyyy` to ISO `yyyy-MM-dd`. Idempotent — passes already-ISO
 * input through untouched so callers that hand it normalised data (tests,
 * future endpoints) do not double-flip the format.
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

/**
 * Converts `dd-MM-yyyy HH:mm` to ISO `yyyy-MM-ddTHH:mm`. Same idempotency
 * contract as {@link toIsoDate} — already-ISO datetimes go through unchanged.
 */
function toIsoDateTime(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    return value;
  }
  const match = /^(\d{2})-(\d{2})-(\d{4})\s+(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return value;
  }
  const [, day, month, year, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}`;
}
