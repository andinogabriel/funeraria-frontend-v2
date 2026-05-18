import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

/**
 * User-selectable theme preference.
 *
 * - `auto` — follow the OS `prefers-color-scheme` media query (the original behavior).
 * - `light` / `dark` — manual override that wins over the OS preference.
 */
export type ThemePreference = 'auto' | 'light' | 'dark';

/**
 * The actual theme that ends up rendered. Always concrete (no `auto`) because the
 * media query has been resolved.
 */
export type EffectiveTheme = 'light' | 'dark';

/**
 * Centralised theme controller.
 *
 * <h3>How it interacts with the stylesheet</h3>
 *
 * `styles.scss` ships three theme blocks:
 *
 * 1. The default (light) tokens on bare `html`.
 * 2. A `@media (prefers-color-scheme: dark)` block that re-emits the dark tokens
 *    on `html` whenever the user has not picked a manual override.
 * 3. Explicit `html.theme-dark` / `html.theme-light` blocks that beat the media
 *    query through specificity. The light variant is wrapped in the dark media
 *    query so that on a dark-OS user that picks "Claro" we still flip back.
 *
 * This service writes the `theme-light` / `theme-dark` class on `<html>` whenever
 * the preference is not `auto`. When `auto` is selected we strip both classes so
 * the media query reclaims control.
 *
 * <h3>Why an inline script in `index.html` mirrors this logic</h3>
 *
 * Angular bootstrap takes a couple of frames before the constructor here runs.
 * Without an early read of `localStorage`, a user that picked dark would see a
 * brief flash of the light surface before the service caught up. The inline
 * script in `index.html` performs the minimum DOM mutation needed to avoid the
 * flash — this service stays the source of truth at runtime.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  /** Storage key — namespaced so a future setting bag doesn't collide. */
  private static readonly STORAGE_KEY = 'funeraria.theme';

  private readonly document = inject(DOCUMENT);

  private readonly _preference = signal<ThemePreference>(this.readStoredPreference());

  /** OS-level dark mode. Stays in sync with `prefers-color-scheme` via `matchMedia`. */
  private readonly _systemDark = signal<boolean>(this.readSystemDark());

  /** Current user preference (auto / light / dark). */
  readonly preference = this._preference.asReadonly();

  /** Concrete theme being applied right now — drives icon + tooltip in the toolbar. */
  readonly effective = computed<EffectiveTheme>(() => {
    const pref = this._preference();
    if (pref === 'auto') {
      return this._systemDark() ? 'dark' : 'light';
    }
    return pref;
  });

  constructor() {
    // Apply the class on every preference change. We strip the previous one so
    // that switching auto → light → dark never leaves a stale class behind.
    effect(() => {
      const pref = this._preference();
      const root = this.document.documentElement;
      root.classList.remove('theme-light', 'theme-dark');
      if (pref === 'light' || pref === 'dark') {
        root.classList.add(`theme-${pref}`);
      }
    });

    // Keep the system signal honest when the OS preference changes mid-session
    // (e.g. macOS night-shift, Windows auto theme). `matchMedia` is undefined in
    // SSR / older Jest environments — guard accordingly.
    const mq =
      typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    if (mq) {
      const listener = (event: MediaQueryListEvent): void => this._systemDark.set(event.matches);
      mq.addEventListener('change', listener);
    }
  }

  /**
   * Update the preference. Persists to `localStorage` so a refresh restores the
   * choice. The constructor's effect mirrors the class change to `<html>`.
   */
  setPreference(pref: ThemePreference): void {
    this._preference.set(pref);
    try {
      if (pref === 'auto') {
        localStorage.removeItem(ThemeService.STORAGE_KEY);
      } else {
        localStorage.setItem(ThemeService.STORAGE_KEY, pref);
      }
    } catch {
      // `localStorage` may throw in private windows / quota-exhausted scenarios;
      // the in-memory preference is enough to keep the UI consistent for this
      // tab, and the next refresh will simply fall back to `auto`.
    }
  }

  private readStoredPreference(): ThemePreference {
    try {
      const stored = localStorage.getItem(ThemeService.STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
    } catch {
      // Same `localStorage` caveat as above.
    }
    return 'auto';
  }

  private readSystemDark(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
