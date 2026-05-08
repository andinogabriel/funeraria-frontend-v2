import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatListModule } from '@angular/material/list';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { AuthService } from '../auth/auth.service';
import { AuthStore } from '../auth/auth.store';

/**
 * Authenticated application shell. Renders the persistent navigation surface (sidenav +
 * toolbar) and a `<router-outlet />` for the active feature. Mounted only inside
 * `authGuard`-protected routes, so it can assume a session exists; the logout action
 * delegates to `AuthService` and routes back to `/login` regardless of server outcome.
 *
 * Material Symbols are loaded as a font in `index.html`; using the `<mat-icon>` element
 * with a string child (rather than the SVG registry) keeps the bundle small and the
 * markup readable.
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
  protected readonly store = inject(AuthStore);

  /** Top-level navigation entries. Kept as a plain readonly array — refactor to a registry
   * once the feature count starts to make hand-curated maintenance painful. */
  protected readonly navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  ] as const;

  protected onLogout(): void {
    this.auth.logout().subscribe({
      complete: () => void this.router.navigate(['/login']),
    });
  }
}
