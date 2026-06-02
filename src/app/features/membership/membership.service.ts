import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { FeeQuote, TariffConfig, TariffConfigUpdate } from './membership.types';

/**
 * Client for the membership-fee tariff. Caches the config snapshot in a signal (read on screen
 * load, patched on a successful edit) and exposes a stateless `quote` for the fee calculator.
 */
@Injectable({ providedIn: 'root' })
export class MembershipService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/membership/tariff`;

  private readonly _config = signal<TariffConfig | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly config = this._config.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  loadConfig(): Observable<TariffConfig> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<TariffConfig>(this.baseUrl).pipe(
      tap({
        next: (data) => {
          this._config.set(data);
          this._loading.set(false);
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this._loading.set(false);
          this._error.set(this.mapError(err));
        },
      }),
    );
  }

  /** Persists an edited tariff; on success the cached config is replaced with the server echo. */
  updateConfig(request: TariffConfigUpdate): Observable<TariffConfig> {
    return this.http
      .put<TariffConfig>(this.baseUrl, request)
      .pipe(tap((config) => this._config.set(config)));
  }

  /** Stateless quote for the fee calculator (age + health-tier code). */
  quote(age: number, healthTier: string): Observable<FeeQuote> {
    const params = new HttpParams().set('age', String(age)).set('healthTier', healthTier);
    return this.http.get<FeeQuote>(`${this.baseUrl}/quote`, { params });
  }

  private mapError(err: { status?: number; error?: { detail?: string } }): string {
    const status = err.status ?? 0;
    if (status === 0) {
      return 'No se pudo contactar al servidor.';
    }
    if (status === 403) {
      return 'No tenés permiso para administrar el tarifario.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar el tarifario.';
  }
}
