import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

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
  imports: [MatIconModule],
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
