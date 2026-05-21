import type { ReceiptType } from '../catalogs/catalogs.types';
import type { Supplier, SupplierRequest } from '../suppliers/supplier.types';

/**
 * Transport types for the incomes (compras / ingresos) slice. Mirrors
 * `IncomeRequestDto` + `IncomeResponseDto` + `IncomePageResponse` on the backend.
 *
 * <h3>Date format wart</h3>
 *
 * The backend ships `incomeDate` and `lastModifiedDate` as `dd-MM-yyyy HH:mm` legacy strings.
 * The service normalises both to ISO `yyyy-MM-ddTHH:mm` on the way in so the rest of the
 * app deals in one format only — same pattern as funerals.
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

/** Income record returned by `GET /api/v1/incomes/{receiptNumber}` and the paginated endpoint. */
export interface Income {
  readonly receiptNumber: string;
  readonly receiptSeries: string;
  /** ISO `yyyy-MM-ddTHH:mm`. */
  readonly incomeDate: string;
  /** ISO `yyyy-MM-ddTHH:mm`; may be empty if never modified. */
  readonly lastModifiedDate: string;
  readonly tax: number;
  readonly totalAmount: number;
  readonly receiptType: ReceiptType | null;
  readonly supplier: Supplier | null;
  readonly incomeUser: IncomeUser | null;
  readonly lastModifiedBy: string | null;
  readonly incomeDetails: readonly IncomeDetail[];
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
  readonly isDeleted?: boolean;
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
