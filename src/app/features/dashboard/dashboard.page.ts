import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';

import { AuthStore } from '../../core/auth/auth.store';

/**
 * Placeholder dashboard introduced in P1 so the auth flow can be exercised end-to-end:
 * login → shell → this page. It surfaces the authorities list returned by the backend so
 * a quick visual check confirms `ROLE_ADMIN` / `ROLE_USER` propagation works.
 *
 * Subsequent feature PRs replace this stub with the actual operational dashboard.
 */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatCardModule, MatIconModule],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly store = inject(AuthStore);

  protected readonly authoritiesText = computed(() => {
    const list = this.store.authorities();
    return list.length > 0 ? list.join(', ') : 'sin roles asignados';
  });
}
