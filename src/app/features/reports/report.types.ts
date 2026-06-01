/**
 * Wire-format types for `GET /api/v1/reports/daily`. Mirrors `DailyReportResponseDto` +
 * its nested summary records on the backend one-to-one.
 */

/** Funeral-service revenue for the day (money IN). */
export interface DailyReportServicesSummary {
  /** Number of non-deleted funerals dated on the day. */
  readonly count: number;
  /** Sum of their `total_amount`; zero when empty. */
  readonly total: number;
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
