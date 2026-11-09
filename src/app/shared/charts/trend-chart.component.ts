import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

/** One plotted series. `slot` picks the categorical color (`--viz-series-<slot>`). */
export interface TrendSeries {
  readonly name: string;
  readonly values: readonly number[];
  readonly slot: 1 | 2;
}

export type TrendChartKind = 'bar' | 'line';

/** Plot geometry, in px. The left margin fits the compact y labels ("1,5 M"). */
const HEIGHT = 200;
const MARGIN = { top: 12, right: 12, bottom: 28, left: 52 } as const;
const DEFAULT_WIDTH = 560;
/** Minimum horizontal room per x label before labels are thinned out. */
const MIN_LABEL_PX = 44;
const MAX_BAR_PX = 28;

/**
 * Small, dependency-free SVG chart for month-by-month trends: bars for a single magnitude,
 * lines for up to two series of the same unit (never two y scales).
 *
 * <h3>Reading aids</h3>
 *
 * - Hover (or arrow keys once the plot has focus) shows a crosshair and a tooltip with every
 *   series' value for that month.
 * - Two series get a legend; a single series is named by the card title instead.
 * - "Ver tabla" swaps the plot for the same numbers as a table, which is also the fallback
 *   for screen readers and for anyone who cannot tell the colors apart.
 *
 * The width follows the container through a ResizeObserver, so text keeps its size instead
 * of scaling with a viewBox.
 */
@Component({
  selector: 'app-trend-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './trend-chart.component.html',
  styleUrl: './trend-chart.component.scss',
})
export class TrendChartComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Accessible name of the plot, e.g. "Servicios por mes". */
  readonly label = input.required<string>();
  readonly kind = input<TrendChartKind>('line');
  /** `yyyy-MM` per point, oldest first. */
  readonly months = input.required<readonly string[]>();
  readonly series = input.required<readonly TrendSeries[]>();
  /** Full-precision formatter for the tooltip and the table. */
  readonly format = input<(value: number) => string>((v) => formatCount(v));

  protected readonly width = signal(DEFAULT_WIDTH);
  protected readonly active = signal<number | null>(null);
  protected readonly showTable = signal(false);

  protected readonly height = HEIGHT;
  protected readonly margin = MARGIN;

  protected readonly plotWidth = computed(() =>
    Math.max(this.width() - MARGIN.left - MARGIN.right, 1),
  );
  protected readonly plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;
  protected readonly baseline = HEIGHT - MARGIN.bottom;

  protected readonly band = computed(() => this.plotWidth() / Math.max(this.months().length, 1));

  protected readonly scale = computed(() =>
    niceScale(Math.max(0, ...this.series().flatMap((s) => s.values))),
  );

  protected readonly ticks = computed(() => {
    const { max, step } = this.scale();
    const ticks: { value: number; y: number; label: string }[] = [];
    for (let value = 0; value <= max + step / 2; value += step) {
      ticks.push({ value, y: this.y(value), label: formatCompact(value) });
    }
    return ticks;
  });

  protected readonly xLabels = computed(() => {
    const months = this.months();
    const every = Math.max(1, Math.ceil(MIN_LABEL_PX / this.band()));
    return months
      .map((month, index) => ({ month, index }))
      .filter(({ index }) => (months.length - 1 - index) % every === 0)
      .map(({ month, index }) => ({ x: this.x(index), text: monthLabel(month, index === 0) }));
  });

  protected readonly bars = computed(() => {
    const first = this.series()[0];
    if (this.kind() !== 'bar' || !first) {
      return [];
    }
    const width = Math.min(this.band() * 0.6, MAX_BAR_PX);
    return first.values.map((value, index) => {
      const top = this.y(value);
      const height = this.baseline - top;
      return {
        index,
        path: roundedTopBar(this.x(index) - width / 2, top, width, height, 4),
      };
    });
  });

  protected readonly lines = computed(() => {
    if (this.kind() !== 'line') {
      return [];
    }
    return this.series().map((s) => ({
      slot: s.slot,
      name: s.name,
      path: s.values
        .map((value, index) => `${index === 0 ? 'M' : 'L'}${this.x(index)},${this.y(value)}`)
        .join(' '),
      points: s.values.map((value, index) => ({ x: this.x(index), y: this.y(value) })),
    }));
  });

  protected readonly tooltip = computed(() => {
    const index = this.active();
    if (index === null) {
      return null;
    }
    const x = this.x(index);
    return {
      x,
      // Flip to the left of the crosshair past the middle so it never leaves the card.
      alignRight: x > this.width() / 2,
      title: monthLabel(this.months()[index], true, 'long'),
      rows: this.series().map((s) => ({
        name: s.name,
        slot: s.slot,
        value: this.format()(s.values[index] ?? 0),
      })),
    };
  });

  protected readonly tableRows = computed(() =>
    this.months().map((month, index) => ({
      month: monthLabel(month, true, 'long'),
      values: this.series().map((s) => this.format()(s.values[index] ?? 0)),
    })),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const element = this.host.nativeElement;
      this.measure(element.clientWidth);
      if (typeof ResizeObserver === 'undefined') {
        return;
      }
      const observer = new ResizeObserver(() => this.measure(element.clientWidth));
      observer.observe(element);
      destroyRef.onDestroy(() => observer.disconnect());
    });
  }

  protected x(index: number): number {
    return MARGIN.left + this.band() * (index + 0.5);
  }

  protected y(value: number): number {
    return MARGIN.top + this.plotHeight * (1 - value / this.scale().max);
  }

  protected onPointerMove(event: PointerEvent): void {
    const svg = event.currentTarget as SVGElement;
    const offset = event.clientX - svg.getBoundingClientRect().left - MARGIN.left;
    const index = Math.floor(offset / this.band());
    this.active.set(Math.min(Math.max(index, 0), this.months().length - 1));
  }

  protected onPointerLeave(): void {
    this.active.set(null);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const last = this.months().length - 1;
    if (last < 0) {
      return;
    }
    const current = this.active();
    let next: number | null = null;
    if (event.key === 'ArrowRight') {
      next = current === null ? 0 : Math.min(current + 1, last);
    } else if (event.key === 'ArrowLeft') {
      next = current === null ? last : Math.max(current - 1, 0);
    } else if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = last;
    } else if (event.key === 'Escape') {
      this.active.set(null);
      return;
    }
    if (next !== null) {
      event.preventDefault();
      this.active.set(next);
    }
  }

  protected toggleTable(): void {
    this.showTable.update((shown) => !shown);
  }

  private measure(width: number): void {
    if (width > 0) {
      this.width.set(width);
    }
  }
}

/** Axis top and step: 4 ticks on a 1 / 2 / 2.5 / 5 x 10^k grid, at least 1 so 0 plots. */
export function niceScale(max: number): { max: number; step: number } {
  if (max <= 0) {
    return { max: 4, step: 1 };
  }
  const raw = max / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step =
    [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((candidate) => candidate >= raw) ??
    10 * magnitude;
  const niceStep = Math.max(step, 1);
  return { max: Math.ceil(max / niceStep) * niceStep, step: niceStep };
}

/** "1,5 M", "250 k", "12". Axis labels only; tooltips use the full formatter. */
export function formatCompact(value: number): string {
  return new Intl.NumberFormat('es-AR', { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('es-AR').format(value);
}

/** `2026-11` to "nov" (or "nov 2026" with the year; "noviembre 2026" in long form). */
export function monthLabel(
  month: string,
  withYear: boolean,
  style: 'short' | 'long' = 'short',
): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1, 1));
  const name = new Intl.DateTimeFormat('es-AR', { month: style, timeZone: 'UTC' })
    .format(date)
    .replace('.', '');
  return withYear || monthNumber === 1 ? `${name} ${year}` : name;
}

/** Bar path with rounded top corners, flat on the baseline. */
function roundedTopBar(x: number, y: number, width: number, height: number, r: number): string {
  const radius = Math.min(r, width / 2, height);
  if (height <= 0) {
    return '';
  }
  return [
    `M${x},${y + height}`,
    `V${y + radius}`,
    `Q${x},${y} ${x + radius},${y}`,
    `H${x + width - radius}`,
    `Q${x + width},${y} ${x + width},${y + radius}`,
    `V${y + height}`,
    'Z',
  ].join(' ');
}
