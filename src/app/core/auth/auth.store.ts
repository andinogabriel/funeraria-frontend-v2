import { Injectable, computed, signal } from '@angular/core';
import type { AuthSession, JwtResponse } from './auth.types';

const SESSION_STORAGE_KEY = 'funeraria.auth.session';

/**
 * Source of truth for the authenticated session. Signal-based so any consumer (guards,
 * interceptors, layout shell, login page) can react synchronously without juggling
 * BehaviorSubjects, and so the rest of the app stays purely zoneless.
 *
 * Persistence: the session is mirrored to localStorage on every mutation and rehydrated
 * when the service is constructed, so a page reload keeps the user logged in until either
 * the token expires (caught by the auth interceptor) or `clear()` is called.
 *
 * The store deliberately exposes only `readonly` signals — mutations go through `setSession`
 * and `clear`, never through `.set()` from outside.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _session = signal<AuthSession | null>(this.loadFromStorage());

  /** Current session, or `null` if no user is authenticated. */
  readonly session = this._session.asReadonly();

  /** True when a non-expired session exists. Cheap derived signal — safe to use in templates. */
  readonly isAuthenticated = computed(() => {
    const current = this._session();
    return current !== null && current.expiresAt > Date.now();
  });

  /** Roles granted to the current user, e.g. `["ROLE_ADMIN"]`. Empty array when unauthenticated. */
  readonly authorities = computed(() => this._session()?.authorities ?? []);

  /**
   * Persists the JWT pair returned by login or refresh as the new active session.
   * `expiresAt` is computed from the server-supplied `expiryDuration` so consumers do not
   * have to redo the math on every check.
   */
  setSession(jwt: JwtResponse): void {
    const next: AuthSession = {
      authorization: jwt.authorization,
      refreshToken: jwt.refreshToken,
      authorities: [...jwt.authorities],
      expiresAt: Date.now() + jwt.expiryDuration,
    };
    this._session.set(next);
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(next));
  }

  /** Wipes the active session and the persisted copy. Called on logout, refresh failure or 401. */
  clear(): void {
    this._session.set(null);
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  /** Reads a persisted session from localStorage, returning null if missing or malformed. */
  private loadFromStorage(): AuthSession | null {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as AuthSession;
      // Basic shape check; if the persisted blob is from an older schema, discard it
      // rather than handing a malformed session to the rest of the app.
      if (
        typeof parsed.authorization === 'string' &&
        typeof parsed.refreshToken === 'string' &&
        Array.isArray(parsed.authorities) &&
        typeof parsed.expiresAt === 'number'
      ) {
        return parsed;
      }
    } catch {
      // fall through and clear
    }
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}
