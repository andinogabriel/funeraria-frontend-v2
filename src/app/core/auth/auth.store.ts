import { Injectable, computed, signal } from '@angular/core';
import type { AuthSession, JwtResponse } from './auth.types';

/** Pre-cookie builds kept the whole session, refresh token included, under this key. */
const LEGACY_SESSION_STORAGE_KEY = 'funeraria.auth.session';
/**
 * Marks that this browser holds a refresh cookie worth trying. It is not a credential (the
 * cookie is HttpOnly and the value here is just "1"); it only spares anonymous visitors a
 * refresh request that is bound to fail on every page load.
 */
const SESSION_HINT_STORAGE_KEY = 'funeraria.auth.active';

/**
 * Source of truth for the authenticated session. Signal-based so any consumer (guards,
 * interceptors, layout shell, login page) can react synchronously without juggling
 * BehaviorSubjects, and so the rest of the app stays purely zoneless.
 *
 * <h3>Memory only</h3>
 *
 * The access token lives in this signal and nowhere else, so script injected into the page
 * cannot lift it from storage, and the long-lived refresh token never reaches JavaScript at
 * all (HttpOnly cookie). A reload starts with no session; `AuthService.restoreSession`, run
 * as an app initializer, gets a new access token from the cookie before the first route
 * renders.
 *
 * The store deliberately exposes only `readonly` signals — mutations go through `setSession`
 * and `clear`, never through `.set()` from outside.
 */
@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly _session = signal<AuthSession | null>(null);

  /** Current session, or `null` if no user is authenticated. */
  readonly session = this._session.asReadonly();

  /** True when a non-expired session exists. Cheap derived signal — safe to use in templates. */
  readonly isAuthenticated = computed(() => {
    const current = this._session();
    return current !== null && current.expiresAt > Date.now();
  });

  /** Roles granted to the current user, e.g. `["ROLE_ADMIN"]`. Empty array when unauthenticated. */
  readonly authorities = computed(() => this._session()?.authorities ?? []);

  constructor() {
    // Purge tokens persisted by builds from before the cookie: they must not outlive the upgrade.
    safeStorage((storage) => storage.removeItem(LEGACY_SESSION_STORAGE_KEY));
  }

  /**
   * Stores the access token returned by login or refresh as the new active session.
   * `expiresAt` is computed from the server-supplied `expiryDuration` so consumers do not
   * have to redo the math on every check.
   */
  setSession(jwt: JwtResponse): void {
    this._session.set({
      authorization: jwt.authorization,
      authorities: [...jwt.authorities],
      expiresAt: Date.now() + jwt.expiryDuration,
    });
    safeStorage((storage) => storage.setItem(SESSION_HINT_STORAGE_KEY, '1'));
  }

  /** Wipes the active session. Called on logout, refresh failure or 401. */
  clear(): void {
    this._session.set(null);
    safeStorage((storage) => storage.removeItem(SESSION_HINT_STORAGE_KEY));
  }

  /**
   * Whether a refresh is worth attempting: this browser signed in and has not signed out or
   * failed a refresh since, so the HttpOnly cookie is probably still there.
   */
  canRestore(): boolean {
    return safeStorage((storage) => storage.getItem(SESSION_HINT_STORAGE_KEY) === '1') ?? false;
  }
}

/** localStorage throws in some private modes and with blocked site data; never let it break auth. */
function safeStorage<T>(use: (storage: Storage) => T): T | undefined {
  try {
    return use(localStorage);
  } catch {
    return undefined;
  }
}
