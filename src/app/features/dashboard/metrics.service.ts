import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type {
  ActivityFeedEntry,
  ActivityFeedResponse,
  DashboardMetrics,
  KpiMetric,
  MetricKind,
  MetricRange,
} from './metrics.types';

/**
 * Read-only client for the dashboard's two metrics endpoints:
 *
 * - `GET /api/v1/metrics/dashboard` — KPI snapshot.
 * - `GET /api/v1/metrics/activity-feed?limit=N` — projected outbox event stream (ADR-0014).
 *
 * Each endpoint has its own cached signal + loading + error so the dashboard page can render
 * the KPIs even when the activity feed is still in-flight (and vice versa). A single
 * `refresh()` helper triggers both in parallel — that is what the operator-facing refresh
 * button calls.
 */
@Injectable({ providedIn: 'root' })
export class MetricsService {
  /** Default limit for the activity feed when the caller does not specify one. */
  static readonly DEFAULT_ACTIVITY_FEED_LIMIT = 20;

  private readonly http = inject(HttpClient);
  private readonly dashboardEndpoint = `${environment.apiBaseUrl}/v1/metrics/dashboard`;
  private readonly seriesEndpoint = `${environment.apiBaseUrl}/v1/metrics/dashboard/series`;
  private readonly activityFeedEndpoint = `${environment.apiBaseUrl}/v1/metrics/activity-feed`;

  private readonly _snapshot = signal<DashboardMetrics | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  private readonly _activityFeed = signal<readonly ActivityFeedEntry[] | null>(null);
  private readonly _activityFeedLoading = signal(false);
  private readonly _activityFeedError = signal<string | null>(null);

  readonly snapshot = this._snapshot.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Latest activity-feed entries, newest first. `null` before the first load so the page can
   * distinguish "still loading" from "loaded and empty".
   */
  readonly activityFeed = this._activityFeed.asReadonly();
  readonly activityFeedLoading = this._activityFeedLoading.asReadonly();
  readonly activityFeedError = this._activityFeedError.asReadonly();

  /**
   * Fetches the dashboard snapshot. Updates the cached signal on success and surfaces a
   * Spanish friendly error on failure (the most common case is 401 right before the auth
   * interceptor refreshes the token; that path is invisible to consumers because the
   * interceptor replays the call transparently).
   */
  load(): Observable<DashboardMetrics> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<DashboardMetrics>(this.dashboardEndpoint).pipe(
      tap({
        next: (data) => {
          this._snapshot.set(data);
          this._loading.set(false);
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this._loading.set(false);
          this._error.set(this.mapError(err));
        },
      }),
    );
  }

  /**
   * Fetches the activity-feed entries. The optional `limit` is forwarded as a query param;
   * when omitted, the backend default applies. Empty / undefined `limit` is dropped so the
   * URL stays clean.
   */
  loadActivityFeed(limit?: number): Observable<ActivityFeedResponse> {
    this._activityFeedLoading.set(true);
    this._activityFeedError.set(null);

    let params = new HttpParams();
    if (limit !== undefined && limit > 0) {
      params = params.set('limit', String(limit));
    }

    return this.http.get<ActivityFeedResponse>(this.activityFeedEndpoint, { params }).pipe(
      tap({
        next: (data) => {
          this._activityFeed.set(data.entries);
          this._activityFeedLoading.set(false);
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this._activityFeedLoading.set(false);
          this._activityFeedError.set(this.mapError(err));
        },
      }),
    );
  }

  /**
   * Recomputes a single time-windowed KPI for an operator-selected range. Stateless — the
   * dashboard page owns the per-card override signal — so this just returns the one-shot
   * observable. Backs the per-card range dropdown.
   */
  loadSeries(metric: MetricKind, range: MetricRange): Observable<KpiMetric> {
    const params = new HttpParams().set('metric', metric).set('range', range);
    return this.http.get<KpiMetric>(this.seriesEndpoint, { params });
  }

  private mapError(err: { status?: number; error?: { detail?: string } }): string {
    const status = err.status ?? 0;
    if (status === 0) {
      return 'No se pudo contactar al servidor.';
    }
    if (status === 401) {
      return 'Sesión expirada. Iniciá sesión nuevamente.';
    }
    if (status === 403) {
      return 'No tenés permiso para ver los indicadores.';
    }
    return err.error?.detail ?? 'No se pudieron cargar los indicadores.';
  }
}
