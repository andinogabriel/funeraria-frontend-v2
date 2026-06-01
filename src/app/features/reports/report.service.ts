import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { DailyReport } from './report.types';

/**
 * Read-only client for `GET /api/v1/reports/daily` (admin-only). Signal-based on purpose: the
 * arqueo page binds directly to {@link report}, {@link loading} and {@link error} without RxJS
 * scaffolding. The HTTP call stays an `Observable<DailyReport>` for callers that need finer
 * control. Mirrors the {@code MetricsService} shape.
 */
@Injectable({ providedIn: 'root' })
export class ReportService {
  private readonly http = inject(HttpClient);
  private readonly dailyEndpoint = `${environment.apiBaseUrl}/v1/reports/daily`;

  private readonly _report = signal<DailyReport | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  /** Last daily report received. `null` before the first successful call. */
  readonly report = this._report.asReadonly();
  /** True while a `loadDaily` is in flight; drives the spinner / disabled state. */
  readonly loading = this._loading.asReadonly();
  /** Friendly Spanish error from the last failed call; cleared on the next success. */
  readonly error = this._error.asReadonly();

  /**
   * Fetches the daily reconciliation for {@code date} (a `yyyy-MM-dd` string). Updates the cached
   * signals as it resolves. Leaves the 401/refresh dance to the auth interceptor.
   */
  loadDaily(date: string): Observable<DailyReport> {
    this._loading.set(true);
    this._error.set(null);
    const params = new HttpParams().set('date', date);
    return this.http.get<DailyReport>(this.dailyEndpoint, { params }).pipe(
      tap({
        next: (data) => {
          this._report.set(data);
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
      return 'No tenés permiso para ver los reportes.';
    }
    return err.error?.detail ?? 'No se pudo cargar el arqueo del día.';
  }
}
