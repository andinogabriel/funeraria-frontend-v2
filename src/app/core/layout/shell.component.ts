import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
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
 *   button on the toolbar toggles it; selecting a nav item auto-closes it. This is the
 *   Material recommendation for narrow viewports.
 * - **Tablet/desktop** (≥ 960 px): sidenav uses `mode="side"` and stays open. The
 *   hamburger button is hidden because the sidenav is always visible.
 *
 * The breakpoint is wired through CDK's `BreakpointObserver` and converted to a signal
 * via `toSignal` so the template can read it as `isHandset()` without an async pipe.
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

  /** Top-level navigation entries. Kept as a plain readonly array — refactor to a registry
   * once the feature count starts to make hand-curated maintenance painful. */
  protected readonly navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
    { path: '/afiliados', label: 'Afiliados', icon: 'group' },
  ] as const;

  /**
   * `true` while the viewport is in the Material "Handset" range (phones + small
   * tablets, < 960 px). Drives the sidenav `mode` and `opened` defaults in the
   * template.
   */
  protected readonly isHandset = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  protected readonly sidenavMode = computed<'over' | 'side'>(() =>
    this.isHandset() ? 'over' : 'side',
  );

  protected readonly sidenavOpened = computed(() => !this.isHandset());

  protected onLogout(): void {
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/login']),
    });
  }

  /**
   * Helper used by the template's nav-item click: closes the sidenav on handset so the
   * user lands on the new page without the drawer obscuring it. No-op on desktop because
   * the sidenav stays open there.
   */
  protected closeIfHandset(sidenav: MatSidenav): void {
    if (this.isHandset()) {
      void sidenav.close();
    }
  }
}
