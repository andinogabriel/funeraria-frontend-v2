import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, tap } from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthStore } from './auth.store';
import { getDeviceInfo } from './device-id';
import type {
  JwtResponse,
  LogoutRequest,
  TokenRefreshRequest,
  UserLoginRequest,
} from './auth.types';

/**
 * Application-facing auth API. Wraps the three calls the rest of the app cares about
 * (`login`, `refresh`, `logout`) and keeps the {@link AuthStore} in sync on success.
 *
 * Failure handling is left to callers (login page surfaces a snackbar, the error
 * interceptor decides whether to retry or sign the user out). This class is deliberately
 * thin — there is no orchestration logic here that the store or the interceptor cannot
 * reason about on its own.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthStore);

  /** Logs in with the supplied credentials and persists the resulting session. */
  login(email: string, password: string): Observable<JwtResponse> {
    const body: UserLoginRequest = {
      email,
      password,
      deviceInfo: getDeviceInfo(),
    };
    return this.http
      .post<JwtResponse>(`${environment.apiBaseUrl}/v1/users/login`, body)
      .pipe(tap((jwt) => this.store.setSession(jwt)));
  }

  /**
   * Rotates the access + refresh token pair using the refresh token already in the store.
   * Used by the error interceptor when it sees a 401 on an authenticated request; the
   * caller is responsible for retrying the original request after the rotation completes.
   */
  refresh(): Observable<JwtResponse> {
    const session = this.store.session();
    if (!session) {
      throw new Error('refresh called without an active session');
    }
    const body: TokenRefreshRequest = {
      refreshToken: session.refreshToken,
      deviceInfo: getDeviceInfo(),
    };
    return this.http
      .post<JwtResponse>(`${environment.apiBaseUrl}/v1/users/refresh`, body)
      .pipe(tap((jwt) => this.store.setSession(jwt)));
  }

  /**
   * Signs the user out, both server-side (so the device session is invalidated and the
   * audit trail records it) and client-side (clears the store). The server call is best
   * effort: if it fails, we still wipe local state so the UI returns to the login page.
   */
  logout(): Observable<void> {
    const session = this.store.session();
    if (!session) {
      this.store.clear();
      return new Observable<void>((subscriber) => {
        subscriber.next();
        subscriber.complete();
      });
    }
    const body: LogoutRequest = {
      token: session.authorization,
      deviceInfo: getDeviceInfo(),
    };
    return this.http
      .put<void>(`${environment.apiBaseUrl}/v1/users/logout`, body)
      .pipe(tap({ next: () => this.store.clear(), error: () => this.store.clear() }));
  }
}
