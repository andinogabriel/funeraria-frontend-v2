/**
 * Wire-format types for `GET /api/v1/metrics/dashboard`. Mirrors
 * `DashboardMetricsResponseDto` + `KpiMetricDto` on the backend one-to-one.
 */

/** One KPI tile worth of data. */
export interface KpiMetric {
  readonly value: number;
  /** Percentage change vs the previous comparable window; `null` when not computable. */
  readonly trendPercent: number | null;
  /** 8-entry series for the inline sparkline; oldest first. May be empty for metrics that
   *  do not support a time series (e.g. plans, which carry no audit timestamp). */
  readonly sparkline: readonly number[];
}

/** Aggregated snapshot rendered by the dashboard bento. */
export interface DashboardMetrics {
  readonly affiliatesActive: KpiMetric;
  readonly plansActive: KpiMetric;
  readonly funeralsThisMonth: KpiMetric;
  readonly auditedEvents24h: KpiMetric;
}
