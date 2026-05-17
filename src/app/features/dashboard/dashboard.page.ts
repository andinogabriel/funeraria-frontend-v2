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
import type { KpiMetric } from './metrics.types';

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
 * Until the outbox grows a real consumer the dashboard renders a small
 * demo feed inline. The shape is already aligned with what the published
 * domain events carry so the swap to a backend-driven feed only touches the
 * source array.
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

  /**
   * Sample recent activity. When the outbox grows a real consumer the
   * dashboard will swap this for a backend-driven feed; the shape is
   * deliberately aligned with what the published events carry.
   */
  protected readonly recentActivity: readonly ActivityItem[] = [
    {
      icon: 'church',
      tone: 'primary',
      title: 'Servicio registrado',
      body: 'Pérez, Juan · Plan Oro',
      time: 'Hace 12 min',
    },
    {
      icon: 'person_add',
      tone: 'secondary',
      title: 'Afiliado dado de alta',
      body: 'Gómez, María · DNI 35.123.456',
      time: 'Hace 1 h',
    },
    {
      icon: 'workspace_premium',
      tone: 'tertiary',
      title: 'Plan actualizado',
      body: 'Plata · margen 22 %',
      time: 'Hoy, 09:14',
    },
    {
      icon: 'policy',
      tone: 'neutral',
      title: 'Evento de auditoría',
      body: 'AFFILIATE_DELETED · admin@funeraria.local',
      time: 'Ayer, 18:42',
    },
  ];

  ngOnInit(): void {
    this.metricsService.load().subscribe({
      // The service already records the error in its own signal; subscribing
      // with a no-op error handler avoids an "unhandled error" warning when
      // the user lands on the dashboard while their session is expiring.
      error: () => undefined,
    });
  }

  protected onRefresh(): void {
    this.metricsService.load().subscribe({ error: () => undefined });
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
