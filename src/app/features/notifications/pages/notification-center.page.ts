import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router } from '@angular/router';

import {
  DataTableComponent,
  type DataTableColumn,
  type DataTableEmptyState,
} from '../../../shared/data-table';
import { formatDateTime } from '../../../shared/format';
import { NotificationService } from '../notification.service';
import type {
  LowStockReachedPayload,
  Notification,
  NotificationPage,
  NotificationType,
} from '../notification.types';

/**
 * Full notification center surface. Reached from the bell drop-down's "Ver todas"
 * link (admin-only route). Mirrors the bell's affordances (mark-as-read,
 * mark-all-read, navigate to target) but lists every notification regardless of
 * read state and paginates so the operator can scroll through the history.
 *
 * <h3>Why this page uses the shared data-table</h3>
 *
 * Previous revision rendered the rows as a hand-rolled <ul> with a Material
 * paginator glued underneath. That diverged from every other admin grid in the
 * app (audit, incomes, items, affiliates) — different paginator placement, no
 * page-size selector on the same row, table height collapsing on empty / short
 * pages. The refactor swaps to `app-data-table` so the surface matches the rest
 * of the listing screens (10-row min height, paginator + page-size in one row,
 * selectable rows + toolbar actions on selection).
 */
@Component({
  selector: 'app-notification-center-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataTableComponent,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
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
  protected readonly pageSize = signal(10);
  protected readonly filter = signal<'unread' | 'all'>('all');
  protected readonly loading = signal(false);
  protected readonly page = signal<NotificationPage | null>(null);
  protected readonly selectedNotification = signal<Notification | null>(null);

  protected readonly rows = computed(() => this.page()?.content ?? []);
  protected readonly totalElements = computed(() => this.page()?.totalElements ?? 0);
  protected readonly unreadCount = this.service.unreadCount;
  protected readonly hasSelection = computed(() => this.selectedNotification() !== null);
  protected readonly selectedIsUnread = computed(() => {
    const n = this.selectedNotification();
    return n !== null && n.readAt === null;
  });

  /** Bound to cell templates so they can call the canonical formatter. */
  protected readonly formatDateTime = formatDateTime;

  // Cell templates — looked up via viewChild and threaded through `cellTemplate`
  // on the column definitions. Matches the pattern audit-event-list uses.
  private readonly createdAtCell =
    viewChild<TemplateRef<{ $implicit: Notification }>>('createdAtCell');
  private readonly typeCell = viewChild<TemplateRef<{ $implicit: Notification }>>('typeCell');
  private readonly itemCell = viewChild<TemplateRef<{ $implicit: Notification }>>('itemCell');
  private readonly stockCell = viewChild<TemplateRef<{ $implicit: Notification }>>('stockCell');

  /**
   * Two-state empty message: filtered (no unread) or truly empty inbox. The
   * grid keeps its 10-row footprint thanks to data-table's empty-state padding.
   */
  protected readonly emptyState = computed<DataTableEmptyState>(() => {
    if (this.filter() === 'unread') {
      return {
        icon: 'mark_email_read',
        title: 'Sin pendientes',
        body: 'No hay notificaciones sin leer. Cambiá el filtro a "Todas" para ver el historial.',
      };
    }
    return {
      icon: 'notifications_none',
      title: 'Sin notificaciones',
      body: 'No se registraron alertas todavía.',
    };
  });

  protected readonly columns = computed<readonly DataTableColumn<Notification>[]>(() => [
    {
      key: 'createdAt',
      label: 'Fecha',
      // Raw ISO so a future client-side sort stays chronological.
      value: (n) => n.createdAt,
      cellTemplate: this.createdAtCell(),
      cellClass: 'tabular-nums whitespace-nowrap',
      sortable: false,
      hideable: false,
    },
    {
      key: 'type',
      label: 'Tipo',
      value: (n) => this.typeLabel(n.type),
      cellTemplate: this.typeCell(),
      sortable: false,
      hideable: false,
    },
    {
      key: 'item',
      label: 'Item',
      value: (n) => {
        if (n.type === 'LOW_STOCK_REACHED') {
          const p = this.lowStockPayload(n);
          return `${p.name} (${p.code})`;
        }
        return '';
      },
      cellTemplate: this.itemCell(),
      sortable: false,
    },
    {
      key: 'stock',
      label: 'Stock',
      value: (n) => {
        if (n.type === 'LOW_STOCK_REACHED') {
          const p = this.lowStockPayload(n);
          return `${p.stockBefore} -> ${p.stockAfter}`;
        }
        return '';
      },
      cellTemplate: this.stockCell(),
      cellClass: 'tabular-nums whitespace-nowrap',
      sortable: false,
    },
  ]);

  protected readonly trackById = (_: number, row: Notification): number => row.id;

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
          // Clear any prior selection — the row may no longer be in view.
          this.selectedNotification.set(null);
        },
        error: () => {
          this.loading.set(false);
          this.snackBar.open('No se pudo cargar las notificaciones', 'Cerrar');
        },
      });
  }

  protected onPageChange(event: { pageIndex: number; pageSize: number }): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.load();
  }

  protected onFilterChange(value: 'unread' | 'all'): void {
    this.filter.set(value);
    this.pageIndex.set(0);
    this.load();
  }

  /**
   * "Marcar como leída" — operates on the currently selected row (toolbar
   * button gated by selection + unread state, matching how audit / incomes
   * handle row-level actions).
   */
  protected onMarkSelectedRead(): void {
    const notification = this.selectedNotification();
    if (notification === null || notification.readAt !== null) {
      return;
    }
    this.service.markRead(notification.id).subscribe({
      next: () => this.load(),
      error: () => this.snackBar.open('No se pudo marcar como leída', 'Cerrar'),
    });
  }

  /**
   * "Ir al item" — navigates to the target surface of the selected
   * notification. Marks the row as read in the background if still unread, so
   * the badge count stays honest.
   */
  protected onOpenSelected(): void {
    const notification = this.selectedNotification();
    if (notification === null) {
      return;
    }
    if (notification.readAt === null) {
      this.service.markRead(notification.id).subscribe({
        error: () => this.snackBar.open('No se pudo marcar como leída', 'Cerrar'),
      });
    }
    this.navigateToTarget(notification);
  }

  protected onMarkAllRead(): void {
    this.service.markAllRead().subscribe({
      next: (result) => {
        this.snackBar.open(
          result.affected > 0
            ? `Marcamos ${result.affected} notificaciones como leídas`
            : 'No había notificaciones pendientes',
          'Cerrar',
        );
        this.load();
      },
      error: () => this.snackBar.open('No se pudieron marcar como leídas', 'Cerrar'),
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
