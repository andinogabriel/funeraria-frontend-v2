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
 * <h3>Date handling</h3>
 *
 * `incomeDate` and `lastModifiedDate` arrive as ISO 8601 strings with a trailing `Z`
 * (UTC instants — the backend's `IncomeResponseDto` types both fields as
 * `Instant`). The service passes them through verbatim; the detail dialog and
 * list cell renderers parse them with `new Date(iso)` which converts to the
 * operator's local timezone automatically. No string mangling lives on the
 * frontend — the previous version normalised a `dd-MM-yyyy HH:mm` payload that
 * silently dropped the timezone context, leaving Argentina users off by three
 * hours on every display.
 */
@Injectable({ providedIn: 'root' })
export class IncomeService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/incomes`;

  private readonly _page = signal<IncomePage | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _pageFetchedAt = signal<Date | null>(null);

  /** Latest paginated snapshot. `null` before the first load. */
  readonly page = this._page.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Wall-clock moment the cached page snapshot was last refreshed. Drives the
   * "Actualizado hace N min" indicator + the visibility auto-refresh decision.
   * See {@link AffiliateService#pageFetchedAt}.
   */
  readonly pageFetchedAt = this._pageFetchedAt.asReadonly();

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
    // Per-column filter params: skip empty / null values so the URL stays clean when the
    // operator has not applied that filter. The backend interprets the absence of a
    // param as the "no filter" sentinel (`""` for strings, `null` for dates).
    if (query.receiptNumber && query.receiptNumber.trim().length > 0) {
      params = params.set('receiptNumber', query.receiptNumber.trim());
    }
    if (query.supplierNif && query.supplierNif.length > 0) {
      params = params.set('supplierNif', query.supplierNif);
    }
    if (query.from) params = params.set('from', query.from);
    if (query.to) params = params.set('to', query.to);

    return this.http.get<IncomePageWire>(`${this.baseUrl}/paginated`, { params }).pipe(
      map((wire) => normalizePage(wire)),
      tap({
        next: (data) => {
          this._page.set(data);
          this._pageFetchedAt.set(new Date());
          this._loading.set(false);
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this._loading.set(false);
          this._error.set(this.mapError(err));
          this._pageFetchedAt.set(null);
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
      .pipe(
        map((wire) => normalizeIncome(wire)),
        // Patch the cached paginated snapshot in place so the list page does
        // not need a fresh round-trip to show the new value the moment the
        // operator returns from the edit form. No-op when the page cache is
        // cold or the receipt lives on a different page.
        tap((income) => this.replaceInCachedPage(receiptNumber, income)),
      );
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

  /**
   * Replaces the matching row inside the cached paginated snapshot. Hooked into
   * the {@link IncomeService#update} pipeline so the operator sees the new value
   * the moment they navigate back to the listing. Silent when the page cache is
   * cold or the receipt is not on the currently-loaded slice.
   */
  private replaceInCachedPage(receiptNumber: string, replacement: Income): void {
    const current = this._page();
    if (current === null) {
      return;
    }
    let changed = false;
    const next = current.content.map((row) => {
      if (row.receiptNumber !== receiptNumber) {
        return row;
      }
      changed = true;
      return replacement;
    });
    if (!changed) {
      return;
    }
    this._page.set({ ...current, content: next });
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
  /** ISO 8601 with trailing `Z` (UTC instant). */
  readonly incomeDate: string;
  /** ISO 8601 with trailing `Z`; may be empty. */
  readonly lastModifiedDate?: string | null;
  readonly tax: number;
  readonly totalAmount: number;
  readonly receiptType: Income['receiptType'];
  readonly supplier: Income['supplier'];
  readonly incomeUser: Income['incomeUser'];
  readonly lastModifiedBy?: Income['lastModifiedBy'];
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
    // The backend ships these as ISO 8601 with a trailing `Z` (Java `Instant`
    // serialised by Jackson). We pass them through verbatim — `new Date(iso)`
    // honours the Z suffix and parses to a real moment in time, which display
    // helpers can then format in the operator's local timezone.
    incomeDate: wire.incomeDate,
    lastModifiedDate: wire.lastModifiedDate ?? '',
    tax: wire.tax,
    totalAmount: wire.totalAmount,
    receiptType: wire.receiptType,
    supplier: wire.supplier,
    incomeUser: wire.incomeUser,
    // Note: lastModifiedBy is a user object (`{ email, firstName, lastName }`),
    // not a raw audit string — see the type comment in income.types.
    lastModifiedBy: wire.lastModifiedBy ?? null,
    incomeDetails: wire.incomeDetails,
  };
}
