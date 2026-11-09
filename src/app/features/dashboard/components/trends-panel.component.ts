import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { of } from 'rxjs';
import { catchError, map, startWith, switchMap } from 'rxjs/operators';

import { formatArs } from '../../membership/billing.types';
import {
  TrendChartComponent,
  type TrendSeries,
} from '../../../shared/charts/trend-chart.component';
import { MetricsService } from '../metrics.service';
import type { MonthlyTrends } from '../metrics.types';

/** Windows the operator can pick; the backend clamps to [3, 24]. */
export const TREND_WINDOWS = [6, 12, 24] as const;
export type TrendWindow = (typeof TREND_WINDOWS)[number];

type TrendsState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly trends: MonthlyTrends };

/**
 * "Tendencias" card of the admin dashboard: services per month, service revenue against
 * supplier purchases, and membership dues billed against dues collected. Every chart covers
 * the same months, with the current (partial) month last.
 *
 * Revenue and purchases share a chart because they share a unit (pesos); the service count
 * gets its own chart instead of a second y axis.
 */
@Component({
  selector: 'app-trends-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonToggleModule, MatProgressBarModule, TrendChartComponent],
  templateUrl: './trends-panel.component.html',
  styleUrl: './trends-panel.component.scss',
})
export class TrendsPanelComponent {
  private readonly metrics = inject(MetricsService);

  protected readonly windows = TREND_WINDOWS;
  protected readonly window = signal<TrendWindow>(12);
  /** Bumped by "Reintentar" so the same window is fetched again. */
  private readonly attempt = signal(0);
  private readonly request = computed(() => ({ months: this.window(), attempt: this.attempt() }));
  protected readonly formatArs = formatArs;

  protected readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ months }) =>
        this.metrics.loadTrends(months).pipe(
          map((trends): TrendsState => ({ status: 'ready', trends })),
          catchError(() => of<TrendsState>({ status: 'error' })),
          startWith<TrendsState>({ status: 'loading' }),
        ),
      ),
    ),
    { initialValue: { status: 'loading' } as TrendsState },
  );

  private readonly points = computed(() => {
    const state = this.state();
    return state.status === 'ready' ? state.trends.points : [];
  });

  protected readonly months = computed(() => this.points().map((p) => p.month));

  protected readonly services = computed<readonly TrendSeries[]>(() => [
    { name: 'Servicios', slot: 1, values: this.points().map((p) => p.funerals) },
  ]);

  protected readonly revenue = computed<readonly TrendSeries[]>(() => [
    { name: 'Facturación', slot: 1, values: this.points().map((p) => p.funeralRevenue) },
    { name: 'Compras', slot: 2, values: this.points().map((p) => p.purchases) },
  ]);

  protected readonly dues = computed<readonly TrendSeries[]>(() => [
    { name: 'Emitidas', slot: 1, values: this.points().map((p) => p.duesBilled) },
    { name: 'Cobradas', slot: 2, values: this.points().map((p) => p.duesCollected) },
  ]);

  /** Headline totals for the window, shown next to each chart title. */
  protected readonly totals = computed(() => {
    const sum = (pick: (p: MonthlyTrends['points'][number]) => number) =>
      this.points().reduce((acc, p) => acc + pick(p), 0);
    return {
      services: sum((p) => p.funerals),
      revenue: sum((p) => p.funeralRevenue),
      billed: sum((p) => p.duesBilled),
      collected: sum((p) => p.duesCollected),
    };
  });

  /** Share of the billed dues collected over the window, or null with nothing billed. */
  protected readonly collectionRate = computed(() => {
    const { billed, collected } = this.totals();
    return billed > 0 ? Math.round((collected / billed) * 100) : null;
  });

  protected onWindow(value: TrendWindow): void {
    this.window.set(value);
  }

  protected retry(): void {
    this.attempt.update((n) => n + 1);
  }
}
