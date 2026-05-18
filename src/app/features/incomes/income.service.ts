import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { Income, IncomePage, IncomePageQuery, IncomeRequest } from './income.types';

/**
 * Client for the incomes (compras / ingresos) slice. Admin-only on the backend.
 *
 * <h3>Why no list cache</h3>
 *
 * Unlike the other CRUD services (brand / category / item / plan / supplier / affiliate)
 * incomes are paginated server-side because the table can grow into thousands of receipts.
 * Keeping a cache of "the current page" would either drift the moment a peer mutates the
 * data set or force a refetch on every keystroke — neither buys anything. The service
 * exposes the latest page through a signal so the page component reads it synchronously,
 * but every call hits the server (with the active query params), and mutations rely on the
 * subsequent page reload rather than an in-memory patch.
 *
 * <h3>Date normalisation</h3>
 *
 * `incomeDate` and `lastModifiedDate` arrive as `dd-MM-yyyy HH:mm` strings; the service
 * normalises both to ISO so the rest of the app deals in one format.
 */
@Injectable({ providedIn: 'root' })
export class IncomeService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/incomes`;

  private readonly _page = signal<IncomePage | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  /** Latest paginated snapshot. `null` before the first load. */
  readonly page = this._page.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /** Rows on the current page; convenience derived signal for templates. */
  readonly rows = computed<readonly Income[]>(() => this._page()?.content ?? []);

  /** Total elements across all pages — drives the paginator's `length`. */
  readonly totalElements = computed(() => this._page()?.totalElements ?? 0);

  /**
   * Fetches a paginated slice of incomes. Updates the `page` signal on success and clears
   * the error state. Stale-while-revalidate is implemented in the page component: the page
   * data stays visible during refetches so the operator never sees a blank table flash.
   */
  loadPage(query: IncomePageQuery = {}): Observable<IncomePage> {
    this._loading.set(true);
    this._error.set(null);

    let params = new HttpParams();
    if (query.page !== undefined) params = params.set('page', String(query.page));
    if (query.limit !== undefined) params = params.set('limit', String(query.limit));
    if (query.sortBy) params = params.set('sortBy', query.sortBy);
    if (query.sortDir) params = params.set('sortDir', query.sortDir);
    if (query.isDeleted !== undefined) {
      params = params.set('isDeleted', String(query.isDeleted));
    }

    return this.http.get<IncomePageWire>(`${this.baseUrl}/paginated`, { params }).pipe(
      map((wire) => normalizePage(wire)),
      tap({
        next: (data) => {
          this._page.set(data);
          this._loading.set(false);
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this._loading.set(false);
          this._error.set(this.mapError(err));
        },
      }),
    );
  }

  /** Fetches a single income by receipt number — used by the detail / edit surfaces. */
  findByReceiptNumber(receiptNumber: string): Observable<Income> {
    return this.http
      .get<IncomeWire>(`${this.baseUrl}/${encodeURIComponent(receiptNumber)}`)
      .pipe(map((wire) => normalizeIncome(wire)));
  }

  create(request: IncomeRequest): Observable<Income> {
    return this.http
      .post<IncomeWire>(this.baseUrl, request)
      .pipe(map((wire) => normalizeIncome(wire)));
  }

  update(receiptNumber: string, request: IncomeRequest): Observable<Income> {
    return this.http
      .put<IncomeWire>(`${this.baseUrl}/${encodeURIComponent(receiptNumber)}`, request)
      .pipe(map((wire) => normalizeIncome(wire)));
  }

  delete(receiptNumber: string): Observable<void> {
    return this.http
      .delete<unknown>(`${this.baseUrl}/${encodeURIComponent(receiptNumber)}`)
      .pipe(map(() => undefined));
  }

  /**
   * Optimistically removes a row from the cached page snapshot so the UI does not have to
   * wait for the next `loadPage` to drop the receipt the operator just deleted. Used by
   * the list page for the snappy-delete pattern; the subsequent {@link loadPage} reconciles
   * the totals + sort order with the server.
   */
  removeFromCachedPage(receiptNumber: string): void {
    const current = this._page();
    if (current === null) {
      return;
    }
    const filtered = current.content.filter((row) => row.receiptNumber !== receiptNumber);
    if (filtered.length === current.content.length) {
      return;
    }
    this._page.set({
      ...current,
      content: filtered,
      totalElements: Math.max(0, current.totalElements - 1),
    });
  }

  private mapError(err: { status?: number; error?: { detail?: string } }): string {
    const status = err.status ?? 0;
    if (status === 0) {
      return 'No se pudo contactar al servidor.';
    }
    if (status === 403) {
      return 'No tenés permiso para administrar ingresos.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar los ingresos.';
  }
}

/* -------------------------------------------------------------------------- */
/*                          Wire-format types + helpers                       */
/* -------------------------------------------------------------------------- */

interface IncomeWire {
  readonly receiptNumber: string;
  readonly receiptSeries: string;
  /** `dd-MM-yyyy HH:mm`. */
  readonly incomeDate: string;
  /** `dd-MM-yyyy HH:mm`; may be empty. */
  readonly lastModifiedDate?: string | null;
  readonly tax: number;
  readonly totalAmount: number;
  readonly receiptType: Income['receiptType'];
  readonly supplier: Income['supplier'];
  readonly incomeUser: Income['incomeUser'];
  readonly lastModifiedBy?: string | null;
  readonly incomeDetails: Income['incomeDetails'];
}

interface IncomePageWire {
  readonly content: readonly IncomeWire[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly size: number;
  readonly number: number;
  readonly first: boolean;
  readonly last: boolean;
}

function normalizePage(wire: IncomePageWire): IncomePage {
  return {
    content: wire.content.map(normalizeIncome),
    totalElements: wire.totalElements,
    totalPages: wire.totalPages,
    size: wire.size,
    number: wire.number,
    first: wire.first,
    last: wire.last,
  };
}

function normalizeIncome(wire: IncomeWire): Income {
  return {
    receiptNumber: wire.receiptNumber,
    receiptSeries: wire.receiptSeries,
    incomeDate: toIsoDateTime(wire.incomeDate),
    lastModifiedDate: wire.lastModifiedDate ? toIsoDateTime(wire.lastModifiedDate) : '',
    tax: wire.tax,
    totalAmount: wire.totalAmount,
    receiptType: wire.receiptType,
    supplier: wire.supplier,
    incomeUser: wire.incomeUser,
    lastModifiedBy: wire.lastModifiedBy ?? null,
    incomeDetails: wire.incomeDetails,
  };
}

/** `dd-MM-yyyy HH:mm` → `yyyy-MM-ddTHH:mm`. Idempotent. */
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
