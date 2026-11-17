import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { ActiveSession } from './session.types';

/**
 * Client for the signed-in user's own device sessions (backend ADR-0024). The device-id header
 * that marks the current session is added by the auth interceptor, like on every request.
 */
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/users/me/sessions`;

  /** Sessions that can still be used, the current one first, then the most recently used. */
  list(): Observable<readonly ActiveSession[]> {
    return this.http
      .get<readonly ActiveSession[]>(this.baseUrl)
      .pipe(map((sessions) => [...sessions].sort((a, b) => Number(b.current) - Number(a.current))));
  }

  /** Closes another session; the backend refuses the current one (409), which is a logout. */
  close(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/${id}`);
  }

  /** Closes every session except this one; emits how many were closed. */
  closeOthers(): Observable<number> {
    return this.http
      .delete<{ readonly closed: number }>(this.baseUrl)
      .pipe(map((response) => response.closed));
  }
}

/** Spanish message for a failed sessions request. */
export function sessionErrorMessage(err: { status?: number; error?: { detail?: string } }): string {
  if ((err.status ?? 0) === 0) {
    return 'No se pudo contactar al servidor.';
  }
  if (err.status === 404) {
    return 'La sesión ya no existe.';
  }
  return err.error?.detail ?? 'No se pudieron consultar las sesiones.';
}
