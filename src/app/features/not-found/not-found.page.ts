import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Router, RouterLink } from '@angular/router';

import { AuthStore } from '../../core/auth/auth.store';

/**
 * 404 page rendered by the wildcard route at the end of the routing table. Mirrors the
 * landing's mesh-gradient aesthetic so the brand stays consistent even when the user
 * landed somewhere unexpected. The illustration is a small gravestone with the "404" carved
 * into it plus a pair of X_X eyes — a light, on-brand take that signals "this page is gone"
 * without crossing into bad taste.
 *
 * <h3>Smart "back" routing</h3>
 *
 * The primary CTA targets `/dashboard` for authenticated sessions and `/home` for everyone
 * else so the recovery action drops the visitor on a page they actually have access to
 * instead of bouncing them through another guard redirect.
 */
@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './not-found.page.html',
  styleUrl: './not-found.page.scss',
})
export class NotFoundPage {
  private readonly store = inject(AuthStore);
  private readonly router = inject(Router);

  protected readonly primaryRoute = this.store.isAuthenticated() ? '/dashboard' : '/home';
  protected readonly primaryLabel = this.store.isAuthenticated()
    ? 'Volver al dashboard'
    : 'Volver al inicio';

  protected goBack(): void {
    if (typeof history !== 'undefined' && history.length > 1) {
      history.back();
      return;
    }
    void this.router.navigateByUrl(this.primaryRoute);
  }
}
