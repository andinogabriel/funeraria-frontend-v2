import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { AuthStore } from '../../core/auth/auth.store';
import { HeroCarouselComponent, type HeroSlide } from '../../shared/hero-carousel';
import { ActivityFeedComponent, type ActivityItem } from './components/activity-feed.component';
import { KpiTileComponent } from './components/kpi-tile.component';
import {
  QuickActionsBarComponent,
  type QuickAction,
} from './components/quick-actions-bar.component';
import { MetricsService } from './metrics.service';
import type { ActivityFeedEntry, KpiMetric } from './metrics.types';

/**
 * Operator dashboard. Composes the hero carousel, the bento KPI grid, the
 * quick-action bar and the recent-activity feed over a soft mesh-gradient
 * background. The KPI tiles bind to the {@link MetricsService} snapshot which
 * fetches `GET /api/v1/metrics/dashboard` on init and on the operator-facing
 * refresh action.
 *
 * <h3>Sparkline normalisation</h3>
 *
 * The backend ships raw counts (Long values); the {@code <app-kpi-tile>}
 * contract takes a normalised `[0, 1]` array so the sparkline polyline stays
 * inside the SVG viewBox regardless of magnitude. {@link normalizeSparkline}
 * does the conversion per-tile so a single outlier in one metric does not
 * flatten the curves of the others.
 *
 * <h3>Activity feed</h3>
 *
 * Bound to {@link MetricsService#activityFeed}, fed by
 * `GET /api/v1/metrics/activity-feed` (ADR-0014). The backend ships a typed
 * stream of {@link ActivityFeedEntry} rows; {@link mapEntryToActivityItem}
 * turns each one into the icon / tone / title / body / time shape the dumb
 * {@code <app-activity-feed>} component expects.
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActivityFeedComponent,
    HeroCarouselComponent,
    KpiTileComponent,
    MatButtonModule,
    MatIconModule,
    QuickActionsBarComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage implements OnInit {
  private readonly store = inject(AuthStore);
  protected readonly metricsService = inject(MetricsService);

  protected readonly isAdmin = computed(() => this.store.authorities().includes('ROLE_ADMIN'));

  protected readonly metricsLoading = this.metricsService.loading;
  protected readonly metricsError = this.metricsService.error;

  protected readonly activityFeedLoading = this.metricsService.activityFeedLoading;
  protected readonly activityFeedError = this.metricsService.activityFeedError;

  /**
   * Backend-fed activity feed mapped into the presentational shape the
   * {@code <app-activity-feed>} component expects. Returns an empty array
   * before the first load and after a load that returned zero entries; the
   * template distinguishes the two via {@link activityFeedLoading}.
   */
  protected readonly recentActivity = computed<readonly ActivityItem[]>(() => {
    const entries = this.metricsService.activityFeed();
    if (entries === null) {
      return [];
    }
    const now = Date.now();
    return entries.map((entry) => mapEntryToActivityItem(entry, now));
  });

  /** Pre-formatted KPI tiles derived from the backend snapshot. */
  protected readonly affiliatesTile = computed(() =>
    this.tile(this.metricsService.snapshot()?.affiliatesActive),
  );
  protected readonly plansTile = computed(() =>
    this.tile(this.metricsService.snapshot()?.plansActive),
  );
  protected readonly funeralsTile = computed(() =>
    this.tile(this.metricsService.snapshot()?.funeralsThisMonth),
  );
  protected readonly purchasesTile = computed(() =>
    this.tile(this.metricsService.snapshot()?.purchasesThisMonth),
  );
  protected readonly criticalStockTile = computed(() =>
    this.tile(this.metricsService.snapshot()?.criticalStock),
  );
  protected readonly auditTile = computed(() =>
    this.tile(this.metricsService.snapshot()?.auditedEvents24h),
  );

  /**
   * Hero carousel slides — five themed messages cycle every 6 s. CTAs are intentionally
   * absent: the quick-actions bar right below the carousel already hosts the shortcut
   * affordances, so an extra button per slide read as redundant during QA.
   */
  protected readonly heroSlides: readonly HeroSlide[] = [
    {
      backgroundUrl: '/dashboard/slide-serenidad.svg',
      eyebrow: 'Bienvenido',
      title: 'Una nueva forma de acompañar a las familias',
      subtitle:
        'Centralizá afiliados, planes y servicios en una sola consola, con la tranquilidad de que cada acción queda registrada.',
    },
    {
      backgroundUrl: '/dashboard/slide-acompanamiento.svg',
      eyebrow: 'Afiliados',
      title: 'Gestioná el padrón con respeto y precisión',
      subtitle:
        'Altas, modificaciones y consultas integradas, con historial de auditoría completo para cumplimiento y trazabilidad.',
    },
    {
      backgroundUrl: '/dashboard/slide-memoria.svg',
      eyebrow: 'Planes',
      title: 'Diseñá planes a la medida de cada familia',
      subtitle:
        'Combiná items del catálogo, definí márgenes y mantené el precio actualizado sin recalcular a mano.',
    },
    {
      backgroundUrl: '/dashboard/slide-naturaleza.svg',
      eyebrow: 'Catálogo',
      title: 'Tu inventario, siempre al día',
      subtitle:
        'Items, marcas y categorías sincronizados entre formularios y reportes — un solo lugar para mantener el catálogo.',
    },
    {
      backgroundUrl: '/dashboard/slide-cielo.svg',
      eyebrow: 'Auditoría',
      title: 'Confianza por diseño',
      subtitle:
        'Cada operación sensible queda registrada con quién, cuándo y qué — accesible solo para administradores.',
    },
  ];

  /** Quick actions — admins see the auditoría shortcut, regular users do not. */
  protected readonly quickActions = computed<readonly QuickAction[]>(() => {
    const base: QuickAction[] = [
      {
        icon: 'add',
        label: 'Nuevo servicio',
        hint: 'Registrar un servicio funerario',
        routerLink: '/servicios/nuevo',
      },
      {
        icon: 'person_add',
        label: 'Nuevo afiliado',
        hint: 'Sumar al padrón',
        routerLink: '/afiliados/nuevo',
      },
      {
        icon: 'workspace_premium',
        label: 'Planes',
        hint: 'Ver y editar planes',
        routerLink: '/planes',
      },
    ];
    if (this.isAdmin()) {
      base.push({
        icon: 'policy',
        label: 'Auditoría',
        hint: 'Eventos de los últimos días',
        routerLink: '/auditoria',
      });
    } else {
      base.push({
        icon: 'inventory_2',
        label: 'Items',
        hint: 'Catálogo de productos y servicios',
        routerLink: '/items',
      });
    }
    return base;
  });

  ngOnInit(): void {
    // Two independent in-flight requests: a slow activity feed must not block
    // the KPIs from rendering, and vice versa. The service tracks each one's
    // loading + error in its own signal so the template can show partial
    // results when only one of the two endpoints finishes.
    this.metricsService.load().subscribe({
      // The service already records the error in its own signal; subscribing
      // with a no-op error handler avoids an "unhandled error" warning when
      // the user lands on the dashboard while their session is expiring.
      error: () => undefined,
    });
    this.metricsService.loadActivityFeed().subscribe({ error: () => undefined });
  }

  protected onRefresh(): void {
    this.metricsService.load().subscribe({ error: () => undefined });
    this.metricsService.loadActivityFeed().subscribe({ error: () => undefined });
  }

  /**
   * Maps a backend {@link KpiMetric} (raw counts) into the input set
   * {@code <app-kpi-tile>} expects (display string + normalised sparkline +
   * rounded trend number). Returns the placeholder em-dash variant when the
   * snapshot has not loaded yet.
   */
  private tile(metric: KpiMetric | undefined): {
    readonly value: string;
    readonly trend: number | null;
    readonly sparkline: readonly number[];
  } {
    if (!metric) {
      return { value: '—', trend: null, sparkline: [] };
    }
    return {
      value: new Intl.NumberFormat('es-AR').format(metric.value),
      trend: metric.trendPercent !== null ? Math.round(metric.trendPercent) : null,
      sparkline: normalizeSparkline(metric.sparkline),
    };
  }
}

/**
 * Normalises a series of raw counts to the `[0, 1]` range the KPI tile's
 * sparkline expects. Returns the input unchanged when every value is zero
 * (the tile renders a flat baseline in that case). Returns an empty array
 * when the input is empty so the tile suppresses the sparkline entirely.
 */
function normalizeSparkline(series: readonly number[]): readonly number[] {
  if (series.length === 0) {
    return [];
  }
  const max = Math.max(...series);
  if (max <= 0) {
    return series.map(() => 0);
  }
  return series.map((v) => v / max);
}

/** Visual configuration per known backend `eventType`. Catalog-style, easy to extend. */
const ACTIVITY_EVENT_LOOKUP: Readonly<
  Record<
    string,
    { readonly icon: string; readonly tone: ActivityItem['tone']; readonly title: string }
  >
> = {
  FUNERAL_CREATED: { icon: 'church', tone: 'primary', title: 'Servicio registrado' },
  FUNERAL_UPDATED: { icon: 'edit_note', tone: 'primary', title: 'Servicio actualizado' },
  FUNERAL_DELETED: { icon: 'delete', tone: 'neutral', title: 'Servicio eliminado' },
  AFFILIATE_CREATED: { icon: 'person_add', tone: 'secondary', title: 'Afiliado dado de alta' },
  AFFILIATE_UPDATED: { icon: 'edit', tone: 'secondary', title: 'Afiliado actualizado' },
  AFFILIATE_MARKED_DECEASED: {
    icon: 'local_florist',
    tone: 'tertiary',
    title: 'Afiliado marcado como fallecido',
  },
  AFFILIATE_DELETED: { icon: 'person_remove', tone: 'neutral', title: 'Afiliado eliminado' },
};

/**
 * Renders a backend {@link ActivityFeedEntry} into the icon / tone / title /
 * body / time shape the {@code <app-activity-feed>} component expects. The
 * mapping is one-to-one with the seven {@code DomainEvent} subtypes declared
 * on the backend (ADR-0013/0014). An unknown event type falls back to a
 * neutral pill — the dashboard should not crash if the backend ships a new
 * event before the frontend learns about it.
 */
function mapEntryToActivityItem(entry: ActivityFeedEntry, now: number): ActivityItem {
  const visuals = ACTIVITY_EVENT_LOOKUP[entry.eventType] ?? {
    icon: 'info',
    tone: 'neutral' as const,
    title: entry.eventType,
  };
  return {
    icon: visuals.icon,
    tone: visuals.tone,
    title: visuals.title,
    body: entry.summary,
    time: formatRelativeTime(entry.occurredAt, now),
  };
}

/**
 * Short Spanish relative-time label suitable for an activity feed. Returns
 * an ISO-derived label when the timestamp cannot be parsed so the row still
 * renders something operator-readable.
 */
function formatRelativeTime(occurredAt: string, now: number): string {
  const occurredMs = Date.parse(occurredAt);
  if (Number.isNaN(occurredMs)) {
    return occurredAt;
  }
  const diffSec = Math.max(0, Math.round((now - occurredMs) / 1_000));
  if (diffSec < 60) {
    return 'Hace unos segundos';
  }
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) {
    return `Hace ${diffMin} min`;
  }
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) {
    return `Hace ${diffHours} h`;
  }
  const diffDays = Math.round(diffHours / 24);
  if (diffDays === 1) {
    return 'Ayer';
  }
  if (diffDays < 7) {
    return `Hace ${diffDays} días`;
  }
  // > 7 days old: absolute date, locale-formatted. `Intl.DateTimeFormat` is
  // bundled with the runtime; `es-AR` is registered in app.config.ts so
  // month names come back in Spanish.
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(occurredMs));
}
