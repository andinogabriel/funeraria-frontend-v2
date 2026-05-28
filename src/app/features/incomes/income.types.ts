import type { ReceiptType } from '../catalogs/catalogs.types';
import type { Supplier, SupplierRequest } from '../suppliers/supplier.types';

/**
 * Transport types for the incomes (compras / ingresos) slice. Mirrors
 * `IncomeRequestDto` + `IncomeResponseDto` + `IncomePageResponse` on the backend.
 *
 * <h3>Date format</h3>
 *
 * The backend ships `incomeDate` and `lastModifiedDate` as ISO 8601 strings with a trailing
 * `Z` (UTC instants — `IncomeResponseDto.incomeDate` is a Java `Instant`). The service
 * passes them through verbatim; display helpers parse with `new Date(iso)` which honours the
 * `Z` and converts to the operator's local timezone automatically.
 */

/** User identity attached to the income (the operator who registered the entry). */
export interface IncomeUser {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

/** Line item inside an income — what was bought, how much, at what cost / sale price. */
export interface IncomeDetail {
  readonly quantity: number;
  readonly purchasePrice: number;
  readonly salePrice: number;
  readonly item: {
    readonly id?: number;
    readonly code: string;
    readonly name: string;
    readonly description?: string | null;
    readonly price?: number | null;
  };
}

/** Request body for `POST /api/v1/incomes` and `PUT /api/v1/incomes/{receiptNumber}`. */
export interface IncomeRequest {
  readonly receiptNumber?: number | null;
  readonly receiptSeries?: number | null;
  readonly tax: number;
  readonly receiptType?: { readonly id?: number; readonly name?: string } | null;
  readonly supplier?: SupplierRequest | null;
  readonly incomeDetails: readonly IncomeDetail[];
}

/**
 * Lifecycle state of an income row. {@code ACTIVE} covers originals in use plus
 * reversal counter-entries (which also carry {@code ACTIVE} status but have a
 * non-null {@link Income.reversalOfId}); {@code ANNULLED} only applies to cancelled
 * originals.
 */
export type IncomeStatus = 'ACTIVE' | 'ANNULLED';

/** Income record returned by `GET /api/v1/incomes/{receiptNumber}` and the paginated endpoint. */
export interface Income {
  /** PK of the row. The annul endpoint takes this id (not the receipt number). */
  readonly id: number;
  readonly receiptNumber: string;
  readonly receiptSeries: string;
  /** ISO 8601 with trailing `Z` (UTC instant). */
  readonly incomeDate: string;
  /** ISO 8601 with trailing `Z`; may be empty if never modified. */
  readonly lastModifiedDate: string;
  readonly tax: number;
  readonly totalAmount: number;
  readonly receiptType: ReceiptType | null;
  readonly supplier: Supplier | null;
  readonly incomeUser: IncomeUser | null;
  /**
   * Last operator who touched the income — same shape as {@link incomeUser}, NOT a
   * raw audit string. The backend's `IncomeResponseDto.lastModifiedBy` is a
   * `UserDto` record (email + firstName + lastName); typing it as `string`
   * caused the detail dialog to render `[object Object]` once the operator
   * actually edited a row and the field came back populated.
   */
  readonly lastModifiedBy: IncomeUser | null;
  readonly incomeDetails: readonly IncomeDetail[];
  /** Lifecycle state of the receipt — `ACTIVE` for originals + reversals, `ANNULLED` for cancelled originals. */
  readonly status: IncomeStatus;
  /**
   * Id of the original receipt when this row IS a reversal counter-entry; {@code null}
   * on every active original and on every annulled original. Drives the
   * "Reversion de #N" badge on the list.
   */
  readonly reversalOfId: number | null;
}

/** Server-side paginated response — Spring Data `Page<IncomeResponseDto>`. */
export interface IncomePage {
  readonly content: readonly Income[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly size: number;
  readonly number: number;
  readonly first: boolean;
  readonly last: boolean;
}

/** Query parameters accepted by `GET /api/v1/incomes/paginated`. */
export interface IncomePageQuery {
  readonly page?: number;
  readonly limit?: number;
  readonly sortBy?: string;
  readonly sortDir?: 'asc' | 'desc';
  /**
   * Lifecycle filter. Omit (or set to {@code undefined}) for the "Todas" view —
   * originals + reversals + annulled rows all together. `ACTIVE` shows live receipts
   * (originals + reversal counter-entries); `ANNULLED` shows only cancelled originals.
   */
  readonly status?: IncomeStatus;
  /** Case-insensitive substring match against the income's receipt number. */
  readonly receiptNumber?: string;
  /**
   * Exact match on the linked supplier's NIF. The list page feeds this from an in-menu
   * autocomplete that lets the operator search by supplier name and commits the picked
   * supplier's NIF.
   */
  readonly supplierNif?: string;
  /** Inclusive lower bound on incomeDate as ISO `yyyy-MM-dd`; expanded to start of day. */
  readonly from?: string;
  /** Inclusive upper bound on incomeDate as ISO `yyyy-MM-dd`; expanded to end of day. */
  readonly to?: string;
}
