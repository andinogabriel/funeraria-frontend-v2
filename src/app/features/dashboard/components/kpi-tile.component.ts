import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

/** One selectable rolling window offered by a tile's range menu. */
export interface KpiRangeOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Stat tile for the dashboard bento grid. Renders the standard "icon + eyebrow
 * + value + delta + sparkline" pattern most modern operator dashboards ship
 * (Linear, Stripe, Vercel, Notion). The sparkline is intentionally a tiny SVG
 * polyline — no chart library — because the dashboard hosts a handful of these
 * tiles at most and pulling in chart.js / ng2-charts just for a 60×24 squiggle
 * is unjustified weight.
 *
 * <h3>Loading + empty states</h3>
 *
 * - Pass {@link value} as a string (e.g. `'42'` or `'$ 250.000'`) for ready
 *   data. Pass {@code null} or the literal `'—'` for "no data yet" and the
 *   tile shows the em-dash placeholder we used everywhere else in the app so
 *   the surface stays consistent.
 * - Pass {@link trend} as a positive / negative number for the coloured delta
 *   pill ("↑ 12%" / "↓ 3%"). Pass {@code null} to hide the delta entirely.
 *
 * <h3>Sparkline</h3>
 *
 * Pass {@link sparkline} as a small array (8–12 entries) of normalised
 * `[0, 1]` floats. The component maps them to a 60×24 viewBox so a future
 * swap to real data behind the same shape is mechanical. Pass an empty array
 * or {@code null} to hide the sparkline entirely.
 */
@Component({
  selector: 'app-kpi-tile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, MatMenuModule],
  templateUrl: './kpi-tile.component.html',
  styleUrl: './kpi-tile.component.scss',
})
export class KpiTileComponent {
  /** Material symbol name shown in the coloured icon chip. */
  readonly icon = input.required<string>();

  /** Small uppercase label above the value. */
  readonly label = input.required<string>();

  /** Primary number / amount; `null` collapses to the em-dash placeholder. */
  readonly value = input<string | null>(null);

  /**
   * Tone of the icon chip. Maps onto the Material 3 container palette so the
   * tile inherits the active theme (light / dark) for free.
   */
  readonly tone = input<'primary' | 'secondary' | 'tertiary' | 'neutral'>('primary');

  /** Optional supporting line below the value (context: "vs. mes anterior"). */
  readonly hint = input<string | null>(null);

  /**
   * Optional trend percentage — positive renders a green up-arrow pill, negative
   * a red down-arrow pill. `null` or `0` hides the pill.
   */
  readonly trend = input<number | null>(null);

  /** Optional normalised sparkline; 8–12 entries between 0 and 1 work best. */
  readonly sparkline = input<readonly number[] | null>(null);

  /**
   * When `true`, the whole tile becomes an actionable button (cursor, focus ring,
   * trailing arrow) that emits {@link tileClick}. Used by the dashboard to drill into
   * the filtered list view behind the KPI.
   */
  readonly interactive = input(false);

  /** Emitted when an {@link interactive} tile is activated (click / Enter / Space). */
  readonly tileClick = output<void>();

  /**
   * Optional rolling-window options shown in a compact range menu in the tile header.
   * When empty, no menu renders. The menu button stops propagation so picking a range
   * never triggers {@link tileClick}.
   */
  readonly ranges = input<readonly KpiRangeOption[]>([]);

  /** Currently selected range value (matches one {@link KpiRangeOption.value}). */
  readonly selectedRange = input<string | null>(null);

  /** Emitted with the new range value when the operator picks one from the menu. */
  readonly rangeChange = output<string>();

  /** Label of the active range, shown on the menu trigger; falls back to the first option. */
  protected readonly selectedRangeLabel = computed(() => {
    const opts = this.ranges();
    if (opts.length === 0) {
      return null;
    }
    const active = opts.find((o) => o.value === this.selectedRange());
    return (active ?? opts[0]).label;
  });

  protected onActivate(): void {
    if (this.interactive()) {
      this.tileClick.emit();
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (this.interactive() && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.tileClick.emit();
    }
  }

  protected onRangePick(value: string): void {
    this.rangeChange.emit(value);
  }

  protected readonly chipClass = computed(() => {
    switch (this.tone()) {
      case 'secondary':
        return 'tile-chip tile-chip--secondary';
      case 'tertiary':
        return 'tile-chip tile-chip--tertiary';
      case 'neutral':
        return 'tile-chip tile-chip--neutral';
      default:
        return 'tile-chip tile-chip--primary';
    }
  });

  protected readonly displayValue = computed(() => this.value() ?? '—');

  /** Polyline `points` string for the sparkline SVG; empty when no data. */
  protected readonly sparkPoints = computed(() => {
    const data = this.sparkline();
    if (!data || data.length < 2) {
      return '';
    }
    const w = 60;
    const h = 24;
    const stepX = w / (data.length - 1);
    return data
      .map(
        (v, i) => `${(i * stepX).toFixed(2)},${((1 - Math.max(0, Math.min(1, v))) * h).toFixed(2)}`,
      )
      .join(' ');
  });

  protected readonly trendPill = computed(() => {
    const t = this.trend();
    if (t === null || t === 0) {
      return null;
    }
    return {
      sign: t > 0 ? '↑' : '↓',
      label: `${Math.abs(t)}%`,
      positive: t > 0,
    };
  });
}
