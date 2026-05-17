import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { AuthStore } from '../../core/auth/auth.store';
import { HeroCarouselComponent, type HeroSlide } from '../../shared/hero-carousel';
import { ActivityFeedComponent, type ActivityItem } from './components/activity-feed.component';
import { KpiTileComponent } from './components/kpi-tile.component';
import {
  QuickActionsBarComponent,
  type QuickAction,
} from './components/quick-actions-bar.component';

/**
 * Operator dashboard. Composes the hero carousel, the bento KPI grid, the
 * quick-action bar and the recent-activity feed over a soft mesh-gradient
 * background. The page is the source of truth for the static content
 * (carousel slides, action shortcuts, sample activity entries) so a future
 * swap to backend-driven feeds only touches this file — the child components
 * stay presentational.
 *
 * <h3>Placeholders</h3>
 *
 * Until the metrics + activity endpoints land, KPI tiles ship with em-dash
 * placeholders + sample sparklines, and the activity feed renders a short
 * "demo" set so the layout is exercised end-to-end. The sparkline arrays use
 * gentle synthetic shapes (mostly stable, slight uptrend) so dark / light
 * mode comparisons during QA do not surface visual noise from random data.
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ActivityFeedComponent,
    HeroCarouselComponent,
    KpiTileComponent,
    QuickActionsBarComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly store = inject(AuthStore);

  protected readonly isAdmin = computed(() => this.store.authorities().includes('ROLE_ADMIN'));

  /** Hero carousel slides — five themed messages cycle every 6 s. */
  protected readonly heroSlides: readonly HeroSlide[] = [
    {
      backgroundUrl: '/dashboard/slide-serenidad.svg',
      eyebrow: 'Bienvenido',
      title: 'Una nueva forma de acompañar a las familias',
      subtitle:
        'Centralizá afiliados, planes y servicios en una sola consola, con la tranquilidad de que cada acción queda registrada.',
      cta: { label: 'Registrar servicio', icon: 'add', routerLink: '/servicios/nuevo' },
    },
    {
      backgroundUrl: '/dashboard/slide-acompanamiento.svg',
      eyebrow: 'Afiliados',
      title: 'Gestioná el padrón con respeto y precisión',
      subtitle:
        'Altas, modificaciones y consultas integradas, con historial de auditoría completo para cumplimiento y trazabilidad.',
      cta: { label: 'Ver afiliados', icon: 'group', routerLink: '/afiliados' },
    },
    {
      backgroundUrl: '/dashboard/slide-memoria.svg',
      eyebrow: 'Planes',
      title: 'Diseñá planes a la medida de cada familia',
      subtitle:
        'Combiná items del catálogo, definí márgenes y mantené el precio actualizado sin recalcular a mano.',
      cta: { label: 'Explorar planes', icon: 'workspace_premium', routerLink: '/planes' },
    },
    {
      backgroundUrl: '/dashboard/slide-naturaleza.svg',
      eyebrow: 'Catálogo',
      title: 'Tu inventario, siempre al día',
      subtitle:
        'Items, marcas y categorías sincronizados entre formularios y reportes — un solo lugar para mantener el catálogo.',
      cta: { label: 'Ir al catálogo', icon: 'inventory_2', routerLink: '/items' },
    },
    {
      backgroundUrl: '/dashboard/slide-cielo.svg',
      eyebrow: 'Auditoría',
      title: 'Confianza por diseño',
      subtitle:
        'Cada operación sensible queda registrada con quién, cuándo y qué — accesible solo para administradores.',
      cta: { label: 'Ver auditoría', icon: 'policy', routerLink: '/auditoria' },
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
   * Sample sparklines for the KPI tiles. Replace with real series once a
   * metrics endpoint exists; the {@code <app-kpi-tile>} contract already
   * accepts arbitrary normalised arrays.
   */
  protected readonly affiliatesSpark = [0.62, 0.65, 0.68, 0.66, 0.7, 0.72, 0.75, 0.78];
  protected readonly plansSpark = [0.4, 0.42, 0.45, 0.48, 0.5, 0.52, 0.55, 0.58];
  protected readonly funeralsSpark = [0.55, 0.5, 0.58, 0.62, 0.6, 0.66, 0.7, 0.72];
  protected readonly auditSpark = [0.35, 0.4, 0.38, 0.45, 0.5, 0.48, 0.55, 0.6];

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
}
