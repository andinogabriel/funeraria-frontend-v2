import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs/operators';

import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';

/**
 * Authenticated application shell. Renders the persistent navigation surface (sidenav +
 * toolbar) and a `<router-outlet />` for the active feature.
 *
 * <h3>Responsive behavior</h3>
 *
 * - **Handset** (< 960 px): sidenav in `over` mode, starts closed; toolbar's menu
 *   button toggles it; selecting a nav item auto-closes it.
 * - **Tablet/desktop** (≥ 960 px): sidenav in `side` mode, open by default. The
 *   menu button collapses it so reports / wide tables can claim the room.
 *
 * <h3>Why the state is tracked through (openedChange) instead of pure [opened]</h3>
 *
 * `MatSidenav.opened` is a two-way-capable input but the imperative `.toggle()`
 * fight back against any reactive `[opened]` binding driven from a separate
 * signal: while the close animation is running, Angular re-evaluates the
 * binding (still `true`) and the sidenav reopens itself. Three earlier
 * attempts to thread this needle (signal flip before `.toggle()`, signal flip
 * after the resolved Promise, computed input only) all left the toggle either
 * unreliable or no-op depending on the order of CD ticks.
 *
 * The pattern that actually works: keep `[opened]` bound to the canonical
 * `sidenavOpened()` signal (so breakpoint switches still flip the initial
 * state), but make the click handler call `sidenav.toggle()` and update the
 * tracking signal exclusively from the `(openedChange)` event that the
 * sidenav itself emits. Source of truth = sidenav, mirrored locally so the
 * input binding never drifts and Angular's CD never undoes the toggle.
 */
@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatListModule,
    MatSidenavModule,
    MatToolbarModule,
    MatTooltipModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);

  protected readonly store = inject(AuthStore);

  protected readonly navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/afiliados', label: 'Afiliados', icon: 'group' },
  ] as const;

  protected readonly isHandset = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /**
   * Canonical "is the drawer currently open?" signal. Read by the template via
   * `sidenavOpened()` and written ONLY from `(openedChange)` so MatSidenav stays
   * the source of truth and never gets a contradictory binding mid-animation.
   */
  protected readonly sidenavOpened = signal(true);

  /**
   * Sidenav mode. `over` floats over the content (handset); `side` reserves room
   * for the drawer (desktop).
   */
  protected readonly sidenavMode = computed<'over' | 'side'>(() =>
    this.isHandset() ? 'over' : 'side',
  );

  constructor() {
    // On a breakpoint switch we re-align the drawer's open state with what the
    // mode implies: closed on handset (drawer should float in only on demand),
    // open on desktop (drawer is the default). Without this, a user that
    // collapsed the desktop drawer and then resizes down to mobile would still
    // see a stuck `over` drawer; conversely, a mobile user that opened the
    // drawer and resized up would see it floating on top of the page.
    effect(() => {
      this.sidenavOpened.set(!this.isHandset());
    });
  }

  /**
   * Toolbar menu click. We toggle the drawer imperatively and let
   * `(openedChange)` update `sidenavOpened()` once the sidenav has actually
   * committed the new state. Doing it the other way around (flipping the
   * signal first and relying on `[opened]` binding) was the source of the
   * "menu button does nothing" bug.
   */
  protected onMenuClick(sidenav: MatSidenav): void {
    void sidenav.toggle();
  }

  /** Tracks the sidenav's own state into our local signal. */
  protected onOpenedChange(opened: boolean): void {
    this.sidenavOpened.set(opened);
  }

  protected onLogout(): void {
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/login']),
    });
  }

  /** Auto-close after navigation but only on handset (over-mode courtesy). */
  protected closeIfHandset(sidenav: MatSidenav): void {
    if (this.isHandset()) {
      void sidenav.close();
    }
  }
}
