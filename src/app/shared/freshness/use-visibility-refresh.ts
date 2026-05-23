import { DOCUMENT } from '@angular/common';
import { DestroyRef, type Signal, inject } from '@angular/core';

/**
 * Wires a `visibilitychange` listener that re-runs {@code refresh} when the
 * tab regains focus AND the data on screen is older than {@code staleAfterMs}.
 * Cleans up automatically when the host component is destroyed.
 *
 * <h3>Why a function instead of a directive</h3>
 *
 * The behaviour is per-page state, not per-DOM-node, and every consumer
 * already has the {@code lastFetchedAt} signal + a refresh callback on the
 * component class. A directive would force a host element binding and an
 * extra import for every list page; a plain function invoked from the
 * constructor reads more naturally — same shape as `effect()` or
 * `takeUntilDestroyed()`.
 *
 * <h3>Stale threshold</h3>
 *
 * Defaults to 60 s — long enough that swapping tabs to copy a URL doesn't
 * fire a needless round-trip, short enough that returning after a coffee
 * break shows fresh numbers. Pass a different value for slow-changing
 * datasets (catálogos / planes — 5 min) or hot ones (auditoría — 10 s).
 *
 * Must be called inside an injection context (constructor or field
 * initialiser) because it pulls `DOCUMENT` + `DestroyRef` from DI.
 */
export function useVisibilityRefresh(
  lastFetchedAt: Signal<Date | null>,
  refresh: () => void,
  options: { staleAfterMs?: number } = {},
): void {
  const document = inject(DOCUMENT);
  const destroyRef = inject(DestroyRef);
  const staleAfterMs = options.staleAfterMs ?? 60_000;

  const onVisibilityChange = (): void => {
    if (document.visibilityState !== 'visible') {
      return;
    }
    const at = lastFetchedAt();
    if (at === null) {
      // No prior fetch — let the page's own load path handle it.
      return;
    }
    if (Date.now() - at.getTime() < staleAfterMs) {
      return;
    }
    refresh();
  };

  document.addEventListener('visibilitychange', onVisibilityChange);
  destroyRef.onDestroy(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange);
  });
}
