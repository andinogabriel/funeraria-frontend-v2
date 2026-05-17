import { ChangeDetectionStrategy, Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';

import { HeroCarouselComponent, type HeroSlide } from '../../shared/hero-carousel';

/**
 * Public landing page rendered at `/home`. Reached by typing the bare domain (root path
 * routes here for unauthenticated visitors via {@code rootRedirectGuard}) or by the
 * "Volver al inicio" affordance on the login page.
 *
 * <h3>Audience</h3>
 *
 * The page targets two distinct audiences with the same surface:
 *
 * - Visitors that have just discovered the brand and need to understand what the consola
 *   does before they invest time in it.
 * - Employees on personal devices that need an obvious "Ingresar" affordance without seeing
 *   the operator chrome.
 *
 * Marketing copy stays restrained — no testimonials, no pricing — because the product is
 * sold offline; the page only needs to read as a credible institutional surface and route
 * the visitor towards login.
 */
@Component({
  selector: 'app-home-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HeroCarouselComponent, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
})
export class HomePage {
  /**
   * Hero carousel slides oriented at outsiders + employees: emotional anchor first, four
   * pillars after. Slides are intentionally CTA-less — the topbar and the closing card
   * already host the "Ingresar" affordance, and an extra button inside every slide read
   * as redundant clutter during QA.
   */
  protected readonly heroSlides: readonly HeroSlide[] = [
    {
      backgroundUrl: '/dashboard/slide-serenidad.svg',
      eyebrow: 'Funeraria',
      title: 'Acompañamos a quienes acompañan',
      subtitle:
        'Una consola pensada para que cada familia reciba el servicio que merece, con la trazabilidad que la operación necesita.',
    },
    {
      backgroundUrl: '/dashboard/slide-acompanamiento.svg',
      eyebrow: 'Afiliados',
      title: 'Padrón centralizado y trazable',
      subtitle:
        'Altas, modificaciones y consultas integradas, con historial completo de cada cambio.',
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
      eyebrow: 'Servicios',
      title: 'Registrá un servicio en minutos',
      subtitle:
        'Datos del fallecido, plan y recibo en un único formulario; nada queda pendiente entre pantallas.',
    },
    {
      backgroundUrl: '/dashboard/slide-cielo.svg',
      eyebrow: 'Seguridad',
      title: 'Tu sesión, vinculada a tu dispositivo',
      subtitle:
        'Los tokens de acceso se firman con la huella del equipo y cada acción sensible queda en el registro de auditoría.',
    },
  ];

  /** Value-prop cards rendered below the hero. Static — no backend feed needed. */
  protected readonly valueProps = [
    {
      icon: 'group',
      title: 'Padrón al día',
      body: 'Afiliados con historial, parentescos y géneros normalizados desde catálogos.',
    },
    {
      icon: 'workspace_premium',
      title: 'Planes a medida',
      body: 'Combiná items del catálogo, definí márgenes y dejá que el sistema mantenga el precio.',
    },
    {
      icon: 'church',
      title: 'Servicios sin fricción',
      body: 'Toda la información del servicio en un único formulario, con recibo autogenerado.',
    },
    {
      icon: 'policy',
      title: 'Auditoría completa',
      body: 'Cada acción sensible queda registrada con quién, cuándo y desde qué dispositivo.',
    },
  ] as const;
}
