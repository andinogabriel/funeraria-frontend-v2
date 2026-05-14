import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
 * toolbar) and a `<router-outlet />` for the active feature. Mounted only inside
 * `authGuard`-protected routes, so it can assume a session exists; the logout action
 * delegates to `AuthService` and routes back to `/login` regardless of server outcome.
 *
 * <h3>Responsive behavior</h3>
 *
 * The shell adapts to two layouts:
 *
 * - **Handset** (< 960 px): sidenav uses `mode="over"` and starts closed. A hamburger
 *   button on the toolbar toggles it; selecting a nav item auto-closes it.
 * - **Tablet/desktop** (≥ 960 px): sidenav uses `mode="side"`. It is open by default
 *   and the user can collapse it by clicking the toolbar's menu button — a screen
 *   recovery pattern that lets reports / wide tables breathe when needed.
 *
 * The desktop-open / desktop-collapsed split is owned by a local signal that resets
 * to `open` whenever the breakpoint switches (so a user that collapsed it on a 14''
 * laptop and then docks to a 27'' monitor gets the sidenav back without ceremony).
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

  /** Top-level navigation entries. */
  protected readonly navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/afiliados', label: 'Afiliados', icon: 'group' },
  ] as const;

  /**
   * `true` while the viewport is in the Material "Handset" range (phones + small
   * tablets, < 960 px). Drives the sidenav `mode` in the template.
   */
  protected readonly isHandset = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /**
   * Desktop-side collapse flag. Independent from the handset state so a user who
   * minimises the sidenav on desktop does not interfere with the auto-open/auto-close
   * behaviour on phones.
   */
  protected readonly desktopCollapsed = signal(false);

  protected readonly sidenavMode = computed<'over' | 'side'>(() =>
    this.isHandset() ? 'over' : 'side',
  );

  /**
   * Final `opened` state. On handset the drawer is closed by default and the user
   * opens it from the hamburger; on desktop it is open unless the user collapsed it.
   */
  protected readonly sidenavOpened = computed(() =>
    this.isHandset() ? false : !this.desktopCollapsed(),
  );

  /**
   * Toggles the drawer for both layouts. `MatSidenav.opened` is reactive on input
   * binding but only reacts to changes detected through Angular's regular CD cycle
   * — a desktop-collapse signal flipped from a click handler was not always picked
   * up reliably (mat-sidenav reads the input once on init and otherwise relies on
   * its imperative `toggle`/`open`/`close` API). Calling `.toggle()` directly is
   * the canonical Material way and works identically across modes.
   *
   * We still mirror the state into `desktopCollapsed` after the toggle settles so
   * `sidenavOpened()` (used as the initial input on first render and after a
   * breakpoint switch) stays consistent with what the drawer actually shows.
   */
  protected onMenuClick(sidenav: MatSidenav): void {
    void sidenav.toggle().then((result) => {
      if (!this.isHandset()) {
        this.desktopCollapsed.set(result === 'close');
      }
    });
  }

  protected onLogout(): void {
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/login']),
    });
  }

  /**
   * Closes the sidenav after selecting a nav item, but only on handset. On desktop
   * the user explicitly chooses when to collapse, so jumping between pages should
   * not steal that decision from them.
   */
  protected closeIfHandset(sidenav: MatSidenav): void {
    if (this.isHandset()) {
      void sidenav.close();
    }
  }
}
