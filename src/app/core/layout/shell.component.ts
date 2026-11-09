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
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { map } from 'rxjs/operators';

import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';
import { NotificationBellComponent } from '../../features/notifications/components/notification-bell.component';
import { NotificationService } from '../../features/notifications/notification.service';
import { CommandPaletteService } from '../command-palette/command-palette.service';
import { ThemeService, type ThemePreference } from '../theme/theme.service';
import { isNavItemVisible, NAV_ITEMS } from './nav-items';

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
    MatMenuModule,
    MatSidenavModule,
    MatToolbarModule,
    MatTooltipModule,
    NotificationBellComponent,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
  ],
  templateUrl: './shell.component.html',
  styleUrl: './shell.component.scss',
  host: { '(document:keydown)': 'onDocumentKeydown($event)' },
})
export class ShellComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly breakpointObserver = inject(BreakpointObserver);

  protected readonly store = inject(AuthStore);
  protected readonly theme = inject(ThemeService);
  private readonly notificationService = inject(NotificationService);
  private readonly palette = inject(CommandPaletteService);

  /** Shortcut label for the toolbar search button: Cmd on Apple platforms, Ctrl elsewhere. */
  protected readonly paletteShortcut = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? '')
    ? '⌘K'
    : 'Ctrl+K';

  /**
   * `true` when the active session carries `ROLE_ADMIN`. Gates the bell icon — the
   * backend would 403 a non-admin's poll anyway, but rendering an affordance that
   * always errors is bad UX.
   */
  protected readonly isAdmin = computed(() => this.store.authorities().includes('ROLE_ADMIN'));

  /**
   * Icon for the toolbar theme button. Reflects the currently rendered theme,
   * not the preference — that way a user on `auto` sees the actual paint
   * (sun on light OS, moon on dark OS) and the icon shifts honestly when they
   * toggle the OS preference.
   */
  protected readonly themeIcon = computed(() =>
    this.theme.effective() === 'dark' ? 'dark_mode' : 'light_mode',
  );

  /** Tooltip mentions the current preference so "Auto" mode is discoverable. */
  protected readonly themeTooltip = computed(() => {
    const pref = this.theme.preference();
    if (pref === 'auto') return 'Tema: automático';
    if (pref === 'dark') return 'Tema: oscuro';
    return 'Tema: claro';
  });

  protected onThemeSelect(pref: ThemePreference): void {
    this.theme.setPreference(pref);
  }

  /**
   * Nav items visible to the current user (see {@link NAV_ITEMS} for the role flags). Derived
   * so it reacts to a role change (a refresh token returning new authorities) without
   * remounting the shell.
   */
  protected readonly navItems = computed(() => {
    const authorities = this.store.authorities();
    return NAV_ITEMS.filter((item) => isNavItemVisible(item, authorities));
  });

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

    // Boot the notification-count poll for admins. The shell is the only screen
    // the bell renders in, so this is the right place to own the lifecycle: the
    // service tears down on injector destroy. Non-admin sessions never start the
    // poll — backend would 403 each call and the badge has nothing to show.
    effect(() => {
      if (this.isAdmin()) {
        this.notificationService.startPolling();
      } else {
        this.notificationService.stopPolling();
      }
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

  /**
   * Ctrl+K / Cmd+K opens the command palette from anywhere in the authenticated app. The
   * browser's own binding for the shortcut (focus the address bar search) is suppressed.
   */
  protected onDocumentKeydown(event: KeyboardEvent): void {
    if (this.palette.isShortcut(event)) {
      event.preventDefault();
      this.openPalette();
    }
  }

  protected openPalette(): void {
    this.palette.open();
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
