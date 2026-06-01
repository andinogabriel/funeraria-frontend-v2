/**
 * Wire-format types for `GET /api/v1/reports/daily`. Mirrors `DailyReportResponseDto` +
 * its nested summary records on the backend one-to-one.
 */

/** One funeral service in the day's detail. */
export interface DailyReportServiceLine {
  /** The funeral's receipt number (e.g. `F-99121`). */
  readonly receiptNumber: string;
  /** Full name of the deceased the service was for. */
  readonly deceasedName: string;
  /** Name of the plan sold, or `null` when the funeral has no linked plan. */
  readonly planName: string | null;
  /** The funeral's `total_amount`. */
  readonly amount: number;
}

/** One supplier purchase in the day's detail. */
export interface DailyReportPurchaseLine {
  /** The income's receipt number. */
  readonly receiptNumber: string;
  /** Name of the supplier, or `null` when the income has no linked supplier. */
  readonly supplierName: string | null;
  /** The income's `total_amount`; negative for reversal counter-entries. */
  readonly amount: number;
  /** Lifecycle state — `ACTIVE` or `ANNULLED`. */
  readonly status: 'ACTIVE' | 'ANNULLED';
  /** `true` when this row is a reversal counter-entry (negative amount, back-points to an original). */
  readonly reversal: boolean;
}

/** Funeral-service revenue for the day (money IN). */
export interface DailyReportServicesSummary {
  /** Number of non-deleted funerals dated on the day. */
  readonly count: number;
  /** Sum of their `total_amount`; zero when empty. */
  readonly total: number;
  /** The individual funerals that make up the total, newest first. */
  readonly lines: readonly DailyReportServiceLine[];
}

/** Supplier-purchase outflow for the day (money OUT). */
export interface DailyReportPurchasesSummary {
  /** Number of ACTIVE income rows dated on the day (includes reversal counter-entries). */
  readonly count: number;
  /**
   * Sum of their `total_amount`. Reversal counter-entries contribute negative amounts so an
   * annulled-and-reversed purchase nets to zero. Zero when empty.
   */
  readonly total: number;
  /** Number of ANNULLED originals dated on the day, surfaced for awareness. */
  readonly annulledCount: number;
  /** The individual incomes that make up the day — ACTIVE, reversal and ANNULLED — newest first. */
  readonly lines: readonly DailyReportPurchaseLine[];
}

/** Daily cash reconciliation ("arqueo diario"). */
export interface DailyReport {
  /** Day reconciled, ISO-8601 (`yyyy-MM-dd`). */
  readonly date: string;
  readonly services: DailyReportServicesSummary;
  readonly purchases: DailyReportPurchasesSummary;
  /** `services.total - purchases.total`. Positive = cash in exceeded stock spend. */
  readonly net: number;
}
