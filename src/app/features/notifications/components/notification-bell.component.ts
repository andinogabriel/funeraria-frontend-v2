import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule, MatMenuTrigger } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';

import { NotificationService } from '../notification.service';
import type { LowStockReachedPayload, Notification, NotificationType } from '../notification.types';

/**
 * Bell icon in the admin toolbar. Shows the unread count as a badge; the menu drops
 * down on click and lists the freshest 10 unread alerts with a "Ver todas" link to
 * the full notification center.
 *
 * <h3>Polling</h3>
 *
 * The unread-count poll is owned by {@link NotificationService} — see its class
 * comment for the 60 s cadence rationale. The bell itself just reads the cached
 * signal. The drop-down's list is fetched lazily on open so a closed bell costs
 * nothing beyond the badge refresh.
 *
 * <h3>Routing on click</h3>
 *
 * Each LOW_STOCK_REACHED row navigates to the items list pre-filtered to that item's
 * code so the admin can immediately review / re-stock it. Marking the row as read
 * happens in the same handler before the navigate fires.
 */
@Component({
  selector: 'app-notification-bell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatBadgeModule,
    MatButtonModule,
    MatDividerModule,
    MatIconModule,
    MatMenuModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.scss',
})
export class NotificationBellComponent {
  private readonly service = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  /** Cached unread count from the polling service — drives the badge. */
  protected readonly unreadCount = this.service.unreadCount;

  /** Last 10 unread rows fetched lazily on menu open. */
  protected readonly recent = signal<readonly Notification[]>([]);
  protected readonly loading = signal(false);

  /**
   * Lazily load the recent unread on menu open. Avoids the round-trip + payload cost
   * when the operator never opens the menu (the badge alone tells them there are
   * pending alerts; that is often enough).
   */
  protected onMenuOpened(): void {
    this.loading.set(true);
    this.service.loadPage({ page: 0, limit: 10, onlyUnread: true }).subscribe({
      next: (page) => {
        this.recent.set(page.content);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snackBar.open('No se pudo cargar las notificaciones', 'Cerrar');
      },
    });
  }

  /**
   * Handler for a single notification card. Marks the row as read and navigates to
   * the type-specific destination — for LOW_STOCK_REACHED that is the items list
   * filtered to the originating item's code.
   */
  protected onSelect(notification: Notification, trigger: MatMenuTrigger): void {
    trigger.closeMenu();
    this.service.markRead(notification.id).subscribe({
      error: () => this.snackBar.open('No se pudo marcar como leida', 'Cerrar'),
    });
    this.navigateToTarget(notification);
  }

  /** Bulk-flip handler for the "Marcar todas como leidas" button at the menu footer. */
  protected onMarkAllRead(trigger: MatMenuTrigger): void {
    trigger.closeMenu();
    this.service.markAllRead().subscribe({
      next: (result) => {
        // Empty the cached list immediately — the next poll would do it anyway, but the
        // operator gets a clean drop-down right away.
        this.recent.set([]);
        this.snackBar.open(
          result.affected > 0
            ? `Marcamos ${result.affected} notificaciones como leidas`
            : 'No habia notificaciones pendientes',
          'Cerrar',
        );
      },
      error: () => this.snackBar.open('No se pudieron marcar como leidas', 'Cerrar'),
    });
  }

  /** Helpers exposed to the template. */
  protected lowStockPayload(notification: Notification): LowStockReachedPayload {
    return notification.payload as LowStockReachedPayload;
  }

  protected typeLabel(type: NotificationType): string {
    if (type === 'LOW_STOCK_REACHED') {
      return 'Stock bajo';
    }
    return type;
  }

  private navigateToTarget(notification: Notification): void {
    if (notification.type === 'LOW_STOCK_REACHED') {
      const payload = this.lowStockPayload(notification);
      void this.router.navigate(['/items'], { queryParams: { code: payload.code } });
    }
  }
}
