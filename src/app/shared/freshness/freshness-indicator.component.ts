import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

/**
 * Compact "Actualizado hace N min" stamp shown next to the Refresh button on
 * list pages. Tells the operator how stale the data on screen is, so two
 * sessions looking at the same record don't silently diverge.
 *
 * <h3>Re-rendering cadence</h3>
 *
 * Time is read from a module-private signal that ticks every 30 s. The
 * indicator's `relativeLabel` is a computed signal over that tick + the
 * {@link FreshnessIndicatorComponent#updatedAt} input, so the label rolls
 * over from "ahora" → "hace 1 min" → "hace 2 min" without per-instance
 * timers (one global interval, every page that mounts an indicator reads
 * from the same tick).
 *
 * <h3>Label thresholds</h3>
 *
 * - {@code <30 s}     → "Actualizado ahora"
 * - {@code <60 s}     → "Actualizado hace menos de 1 min"
 * - {@code <60 min}   → "Actualizado hace N min"
 * - {@code <24 h}     → "Actualizado hace N h"
 * - otherwise         → "Actualizado hace N días"
 *
 * Spanish, lowercase. Designed to be unobtrusive — the operator's eye
 * registers a number and a unit, nothing more.
 */
@Component({
  selector: 'app-freshness-indicator',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (relativeLabel(); as label) {
      <span
        class="text-xs text-[var(--mat-sys-on-surface-variant)] whitespace-nowrap"
        [attr.title]="absoluteTitle()"
      >
        {{ label }}
      </span>
    }
  `,
})
export class FreshnessIndicatorComponent {
  /**
   * Moment the data on screen was last fetched from the server. {@code null}
   * suppresses the indicator entirely — useful during the very first load,
   * before any fetch has resolved.
   */
  readonly updatedAt = input<Date | null>(null);

  protected readonly relativeLabel = computed<string | null>(() => {
    const at = this.updatedAt();
    if (at === null) {
      return null;
    }
    // Read the tick so the computed re-runs as time passes.
    const now = nowTick();
    const elapsedMs = now - at.getTime();
    return formatRelative(elapsedMs);
  });

  protected readonly absoluteTitle = computed<string | null>(() => {
    const at = this.updatedAt();
    if (at === null) {
      return null;
    }
    return `Última actualización: ${at.toLocaleString('es-AR')}`;
  });
}

/**
 * Module-private ticking signal. Bumps every 30 s so every freshness indicator
 * in the app re-renders in lock-step without per-instance timers. The value
 * stored in the signal is unused — `nowTick()` subscribes to it (so the
 * computed re-runs on the tick) and then returns a fresh {@code Date.now()}.
 * That keeps the elapsed math accurate even before the first interval tick
 * fires, which is critical for fast unit tests.
 */
const tick = signal<number>(0);
let timerStarted = false;

function nowTick(): number {
  if (!timerStarted && typeof window !== 'undefined') {
    timerStarted = true;
    window.setInterval(() => tick.set(tick() + 1), 30_000);
  }
  // Subscribe to the tick (re-render trigger) but read time from the system
  // clock so the elapsed delta is always honest.
  tick();
  return Date.now();
}

function formatRelative(elapsedMs: number): string {
  if (elapsedMs < 30_000) {
    return 'Actualizado ahora';
  }
  if (elapsedMs < 60_000) {
    return 'Actualizado hace menos de 1 min';
  }
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 60) {
    return `Actualizado hace ${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `Actualizado hace ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return `Actualizado hace ${days} día${days === 1 ? '' : 's'}`;
}
