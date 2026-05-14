import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { toPageQueryParams } from '../../core/api/http-helpers';
import type { Page, PageRequest } from '../../core/api/pagination.types';
import { DEFAULT_PAGE_REQUEST } from '../../core/api/pagination.types';
import { environment } from '../../../environments/environment';
import type { AuditEvent, AuditEventFilter } from './audit.types';

/**
 * Read-only client for the audit log endpoint. Signal-based on purpose: consumers (the
 * eventual compliance dashboard page) bind directly to {@link page}, {@link loading} and
 * {@link error} in templates without any RxJS scaffolding. The HTTP call itself stays as
 * an `Observable<Page<AuditEvent>>` so callers that need fine-grained control (custom
 * subscription, switchMap chains in a filter form) can still get it.
 *
 * This is the reference shape every future feature service should follow:
 * 1. Inject `HttpClient` + read the base URL from `environment`.
 * 2. Expose typed transport DTOs (no `any`).
 * 3. Maintain a small set of `readonly` signals for ergonomic templates.
 * 4. Use `toPageQueryParams` (never manual string concat).
 * 5. Let interceptors handle 401 / refresh — the service does not try to be clever about
 *    auth or retries.
 */
@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/audit-events`;

  private readonly _page = signal<Page<AuditEvent> | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  /** Last page payload received from the server. `null` before the first call completes. */
  readonly page = this._page.asReadonly();

  /** True while an in-flight `search` is pending; UIs can render a spinner / disabled state. */
  readonly loading = this._loading.asReadonly();

  /**
   * Optional error message left by the last failed call. Populated only after a request
   * resolves with an HTTP failure; cleared on the next successful call so the UI never
   * shows stale errors next to fresh data.
   */
  readonly error = this._error.asReadonly();

  /** Convenience derived signal — `true` when there is no data and no in-flight request. */
  readonly empty = computed(() => !this._loading() && (this._page()?.empty ?? true));

  /**
   * Issues a paginated search. The current signals (`page`, `loading`, `error`) update as
   * the request progresses. The returned observable emits the same payload so callers that
   * prefer reactive composition over signal binding stay first-class citizens.
   *
   * <h3>Audit endpoint paging quirk</h3>
   *
   * `AuditEventController` uses 1-based pages on its query string (defaults to `page=1`)
   * while the rest of the app — and the `PageRequest` contract in `pagination.types.ts`
   * — uses Spring Data's canonical 0-based pages. To keep callers blissfully unaware,
   * we translate at this boundary: `pageRequest.page` is taken as 0-based and the wire
   * value is `pageRequest.page + 1`. The response `Page<T>.number` we get back is still
   * 0-based (Spring's PageImpl serialises that way regardless of the controller's input
   * convention), so callers can compare incoming `number` against their stored
   * `pageIndex` without translation.
   */
  search(
    filter: AuditEventFilter = {},
    pageRequest: PageRequest = DEFAULT_PAGE_REQUEST,
  ): Observable<Page<AuditEvent>> {
    this._loading.set(true);
    this._error.set(null);

    const wirePageRequest: PageRequest = {
      ...pageRequest,
      page: pageRequest.page + 1,
    };

    const params = toPageQueryParams(wirePageRequest, {
      actorEmail: filter.actorEmail,
      action: filter.action,
      targetType: filter.targetType,
      targetId: filter.targetId,
      from: filter.from,
      to: filter.to,
    });

    return this.http.get<Page<AuditEvent>>(this.baseUrl, { params }).pipe(
      tap({
        next: (page) => {
          this._page.set(page);
          this._loading.set(false);
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this._loading.set(false);
          this._error.set(this.mapError(err));
        },
      }),
    );
  }

  /** Resets the in-memory state (useful when the consuming page is destroyed and re-opened). */
  reset(): void {
    this._page.set(null);
    this._loading.set(false);
    this._error.set(null);
  }

  private mapError(err: { status?: number; error?: { detail?: string } }): string {
    const status = err.status ?? 0;
    if (status === 0) {
      return 'No se pudo contactar al servidor.';
    }
    if (status === 403) {
      return 'No tenés permiso para ver el registro de auditoría.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar el registro de auditoría.';
  }
}
