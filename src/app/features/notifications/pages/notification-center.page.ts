import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, type PageEvent } from '@angular/material/paginator';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';

import { NotificationService } from '../notification.service';
import type {
  LowStockReachedPayload,
  Notification,
  NotificationPage,
  NotificationType,
} from '../notification.types';

/**
 * Full notification center surface. Reached from the bell drop-down's "Ver todas" link
 * (admin-only route). Mirrors the bell's affordances (mark-as-read, mark-all-read,
 * navigate to target) but lists every notification regardless of read state and
 * paginates so the operator can scroll through the history.
 */
@Component({
  selector: 'app-notification-center-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatDividerModule,
    MatIconModule,
    MatPaginatorModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
  ],
  templateUrl: './notification-center.page.html',
  styleUrl: './notification-center.page.scss',
})
export class NotificationCenterPage {
  private readonly service = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  /** URL-independent local state — the center is a simple paginated list. */
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(20);
  protected readonly filter = signal<'unread' | 'all'>('all');
  protected readonly loading = signal(false);
  protected readonly page = signal<NotificationPage | null>(null);

  protected readonly rows = computed(() => this.page()?.content ?? []);
  protected readonly totalElements = computed(() => this.page()?.totalElements ?? 0);
  protected readonly unreadCount = this.service.unreadCount;

  constructor() {
    this.load();
  }

  /** Re-fetch driven by every state change. */
  private load(): void {
    this.loading.set(true);
    this.service
      .loadPage({
        page: this.pageIndex(),
        limit: this.pageSize(),
        onlyUnread: this.filter() === 'unread' ? true : undefined,
      })
      .subscribe({
        next: (page) => {
          this.page.set(page);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          this.snackBar.open('No se pudo cargar las notificaciones', 'Cerrar');
        },
      });
  }

  protected onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  protected onFilterChange(value: 'unread' | 'all'): void {
    this.filter.set(value);
    this.pageIndex.set(0);
    this.load();
  }

  protected onSelect(notification: Notification): void {
    if (notification.readAt === null) {
      this.service.markRead(notification.id).subscribe({
        error: () => this.snackBar.open('No se pudo marcar como leida', 'Cerrar'),
      });
    }
    this.navigateToTarget(notification);
  }

  protected onMarkRead(notification: Notification, event: Event): void {
    event.stopPropagation();
    if (notification.readAt !== null) {
      return;
    }
    this.service.markRead(notification.id).subscribe({
      next: () => this.load(),
      error: () => this.snackBar.open('No se pudo marcar como leida', 'Cerrar'),
    });
  }

  protected onMarkAllRead(): void {
    this.service.markAllRead().subscribe({
      next: (result) => {
        this.snackBar.open(
          result.affected > 0
            ? `Marcamos ${result.affected} notificaciones como leidas`
            : 'No habia notificaciones pendientes',
          'Cerrar',
        );
        this.load();
      },
      error: () => this.snackBar.open('No se pudieron marcar como leidas', 'Cerrar'),
    });
  }

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
