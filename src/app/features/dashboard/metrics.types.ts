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

/** Time-windowed KPIs that support an operator-selectable range. Mirrors backend `MetricKind`. */
export type MetricKind = 'SERVICES' | 'PURCHASES' | 'AUDIT';

/** Rolling window selectable per card. Mirrors backend `MetricRange` (1 / 7 / 30 / 365 days). */
export type MetricRange = 'DAY' | 'WEEK' | 'MONTH' | 'YEAR';

/** Aggregated snapshot rendered by the dashboard bento. */
export interface DashboardMetrics {
  readonly affiliatesActive: KpiMetric;
  readonly plansActive: KpiMetric;
  readonly funeralsThisMonth: KpiMetric;
  readonly purchasesThisMonth: KpiMetric;
  readonly criticalStock: KpiMetric;
  readonly auditedEvents24h: KpiMetric;
}

/**
 * Single row of `GET /api/v1/metrics/activity-feed`. Mirrors `ActivityFeedEntryDto` on the
 * backend (ADR-0014). The `eventId` is the stable trackBy key; `summary` is the
 * operator-facing Spanish description the dashboard renders as the row body.
 */
export interface ActivityFeedEntry {
  readonly eventId: string;
  readonly eventType: string;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly summary: string;
  /** ISO-8601 UTC timestamp string (eg. `"2026-05-19T14:30:00Z"`). */
  readonly occurredAt: string;
}

/** Envelope for the activity-feed endpoint; mirrors `ActivityFeedResponseDto`. */
export interface ActivityFeedResponse {
  readonly entries: readonly ActivityFeedEntry[];
}
