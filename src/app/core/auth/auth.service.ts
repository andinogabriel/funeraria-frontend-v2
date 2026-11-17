import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import {
  Observable,
  defer,
  finalize,
  firstValueFrom,
  of,
  retry,
  shareReplay,
  tap,
  throwError,
  timer,
} from 'rxjs';

import { environment } from '../../../environments/environment';
import { AuthStore } from './auth.store';
import { getDeviceInfo } from './device-id';
import { withRefreshLock } from './refresh-lock';
import type {
  JwtResponse,
  LogoutRequest,
  TokenRefreshRequest,
  UserLoginRequest,
} from './auth.types';

/** Pause before retrying a refresh the backend answered with 409 (superseded by another tab). */
const SUPERSEDED_RETRY_DELAY_MS = 150;

/**
 * Application-facing auth API. Wraps the calls the rest of the app cares about (`login`,
 * `refresh`, `restoreSession`, `logout`) and keeps the {@link AuthStore} in sync on success.
 *
 * The refresh token is an HttpOnly cookie the browser sends to `/api/v1/users/*` on its own;
 * this class never sees it. Only the short-lived access token reaches JavaScript, and only in
 * memory.
 *
 * Failure handling is left to callers (login page surfaces a snackbar, the interceptors decide
 * whether to retry or sign the user out).
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly store = inject(AuthStore);

  private inFlightRefresh: Observable<JwtResponse> | null = null;

  /** Logs in with the supplied credentials; the response also sets the refresh cookie. */
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
   * Trades the refresh cookie for a new access token (and a rotated cookie).
   *
   * - Single-flight in this tab: concurrent callers (several 401s, the pre-flight check) share
   *   one request.
   * - Serialised across tabs through {@link withRefreshLock}.
   * - A 409 means another tab rotated the cookie a moment ago; by now this tab holds the new
   *   cookie, so the request is retried once.
   */
  refresh(): Observable<JwtResponse> {
    this.inFlightRefresh ??= defer(() =>
      withRefreshLock(() => firstValueFrom(this.postRefresh())),
    ).pipe(
      tap((jwt) => this.store.setSession(jwt)),
      finalize(() => (this.inFlightRefresh = null)),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.inFlightRefresh;
  }

  /**
   * Restores the session after a reload, before the first route renders (app initializer).
   * Never rejects: when there is nothing to restore or the cookie is no longer valid the app
   * simply starts signed out.
   */
  restoreSession(): Promise<void> {
    if (this.store.isAuthenticated() || !this.store.canRestore()) {
      return Promise.resolve();
    }
    return firstValueFrom(this.refresh()).then(
      () => undefined,
      () => this.store.clear(),
    );
  }

  /**
   * Signs the user out, both server-side (so the device session is invalidated, the audit
   * trail records it and the refresh cookie is expired) and client-side (clears the store).
   * The server call is best effort: if it fails, we still wipe local state so the UI returns
   * to the login page.
   */
  logout(): Observable<void> {
    const session = this.store.session();
    if (!session) {
      this.store.clear();
      return of(undefined);
    }
    // The DTO's `token` field is the bare JWT, not the Authorization header value.
    // `session.authorization` carries the `Bearer ` prefix so it can be copied verbatim
    // into headers; we strip it here so the backend's blacklist parser sees a clean
    // compact JWT (the parser rejects whitespace).
    const body: LogoutRequest = {
      token: stripBearerPrefix(session.authorization),
      deviceInfo: getDeviceInfo(),
    };
    return this.http
      .put<void>(`${environment.apiBaseUrl}/v1/users/logout`, body)
      .pipe(tap({ next: () => this.store.clear(), error: () => this.store.clear() }));
  }

  private postRefresh(): Observable<JwtResponse> {
    const body: TokenRefreshRequest = { deviceInfo: getDeviceInfo() };
    return this.http.post<JwtResponse>(`${environment.apiBaseUrl}/v1/users/refresh`, body).pipe(
      retry({
        count: 1,
        delay: (error: unknown) =>
          error instanceof HttpErrorResponse && error.status === 409
            ? timer(SUPERSEDED_RETRY_DELAY_MS)
            : throwError(() => error),
      }),
    );
  }
}

/**
 * Removes the `Bearer ` scheme prefix from an Authorization header value, returning the
 * raw token. Case-insensitive on the scheme name so a mis-cased backend response does
 * not silently bypass the normalisation. Returns the input unchanged when no prefix is
 * present so callers can pass either form without branching.
 */
function stripBearerPrefix(value: string): string {
  const match = /^Bearer\s+/i.exec(value);
  return match ? value.slice(match[0].length) : value;
}
