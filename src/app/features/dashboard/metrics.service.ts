import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { DashboardMetrics } from './metrics.types';

/**
 * Read-only client for `GET /api/v1/metrics/dashboard`. Caches the latest snapshot in a
 * signal so the dashboard page reads it synchronously after the first load, and exposes a
 * `refresh()` helper that the operator-facing refresh action can call.
 *
 * <h3>Why a service vs. inlining the call</h3>
 *
 * The bento page renders four tiles plus a future activity feed, all of which need a
 * coordinated refresh on the user's action. Centralising the load + cache state here means
 * the page stays declarative (signals only) and a future polling / SSE upgrade has one
 * obvious place to land.
 */
@Injectable({ providedIn: 'root' })
export class MetricsService {
  private readonly http = inject(HttpClient);
  private readonly endpoint = `${environment.apiBaseUrl}/v1/metrics/dashboard`;

  private readonly _snapshot = signal<DashboardMetrics | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly snapshot = this._snapshot.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Fetches the dashboard snapshot. Updates the cached signal on success and surfaces a
   * Spanish friendly error on failure (the most common case is 401 right before the auth
   * interceptor refreshes the token; that path is invisible to consumers because the
   * interceptor replays the call transparently).
   */
  load(): Observable<DashboardMetrics> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<DashboardMetrics>(this.endpoint).pipe(
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
