import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import type { UserSummary } from './user.types';

/**
 * Read-only client for the users catalog. Currently only used by the funeral
 * form's "deceasedUser" picker (binding the deceased to the user that owns the
 * affiliate policy). Bigger user-management surfaces — create / disable /
 * change role — will live alongside this service when they ship.
 *
 * <h3>Auth</h3>
 *
 * `GET /api/v1/users` is gated to `ROLE_ADMIN` on the backend (see
 * `UserController.findAll()`). A non-admin operator will see a 403; the
 * service surfaces a friendly Spanish error in that case so consumers can
 * render it without translating status codes.
 */
@Injectable({ providedIn: 'root' })
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/users`;

  private readonly _list = signal<readonly UserSummary[] | null>(null);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly list = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  /**
   * Lists every user. Cached in the `list` signal so subsequent visits to a
   * surface that uses the picker (currently just the funeral form) do not
   * hit the network unless the caller explicitly refetches.
   */
  loadAll(): Observable<readonly UserSummary[]> {
    this._loading.set(true);
    this._error.set(null);
    return this.http.get<readonly UserWire[]>(this.baseUrl).pipe(
      map((wire) => wire.map(toSummary)),
      tap({
        next: (data) => {
          this._list.set(data);
          this._loading.set(false);
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          this._loading.set(false);
          this._error.set(this.mapError(err));
        },
      }),
    );
  }

  /** Looks up a user by id from the cached list, or `undefined`. */
  findById(id: number): UserSummary | undefined {
    return this._list()?.find((user) => user.id === id);
  }

  private mapError(err: { status?: number; error?: { detail?: string } }): string {
    const status = err.status ?? 0;
    if (status === 0) {
      return 'No se pudo contactar al servidor.';
    }
    if (status === 403) {
      return 'No tenés permiso para listar usuarios.';
    }
    return err.error?.detail ?? 'Ocurrió un error al consultar los usuarios.';
  }
}

/**
 * Wire-format user record. Mirrors `UserResponseDto` but stays inside the
 * service file so callers never see the fields we deliberately drop
 * (mobileNumbers, addresses, roles, startDate, active).
 */
interface UserWire {
  readonly id: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly enabled: boolean;
}

function toSummary(wire: UserWire): UserSummary {
  return {
    id: wire.id,
    firstName: wire.firstName,
    lastName: wire.lastName,
    email: wire.email,
    enabled: wire.enabled,
  };
}
