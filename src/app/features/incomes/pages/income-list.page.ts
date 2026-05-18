import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import {
  DataTableComponent,
  type DataTableColumn,
  type DataTableSort,
} from '../../../shared/data-table';
import { IncomeDetailDialogComponent } from '../components/income-detail-dialog.component';
import { IncomeService } from '../income.service';
import type { Income, IncomePageQuery } from '../income.types';

/**
 * Incomes (compras / ingresos) list page. Server-side paginated against
 * `GET /api/v1/incomes/paginated` — the table only holds the current slice and the
 * paginator's total comes from the response payload.
 *
 * <h3>URL-sync of state</h3>
 *
 * Page, size, sort column and sort direction live in the URL (`?page=&size=&sortBy=&sortDir=`).
 * The browser back button restores the previous slice, a refresh keeps the filter, and a
 * link to a specific page can be shared with another operator. The component reads the URL
 * on init + every time it changes, and writes back through `router.navigate` (with
 * `replaceUrl` so the back stack does not accumulate one entry per page change).
 *
 * <h3>Stale-while-revalidate</h3>
 *
 * The previous page's rows stay visible while a new page is loading so the table does not
 * flash a skeleton between clicks; the paginator buttons disable during the in-flight
 * request so a user can not stack three navigations in a row.
 */
@Component({
  selector: 'app-income-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './income-list.page.html',
  styleUrl: './income-list.page.scss',
})
export class IncomeListPage {
  private readonly service = inject(IncomeService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly rows = this.service.rows;
  protected readonly totalElements = this.service.totalElements;

  protected readonly selectedIncome = signal<Income | null>(null);
  protected readonly hasSelection = computed(() => this.selectedIncome() !== null);

  /** Reactive snapshot of the URL query params — drives the backend call. */
  protected readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** Page index parsed from the URL; defaults to 0. */
  protected readonly pageIndex = computed(() => {
    const raw = this.query().get('page');
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });

  /** Page size parsed from the URL; defaults to 20. */
  protected readonly pageSize = computed(() => {
    const raw = this.query().get('size');
    const parsed = raw === null ? 20 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 20;
  });

  /** Sort state parsed from the URL; defaults to `incomeDate desc`. */
  protected readonly sortState = computed<DataTableSort>(() => {
    const active = this.query().get('sortBy') ?? 'incomeDate';
    const dirParam = (this.query().get('sortDir') ?? 'desc') as 'asc' | 'desc';
    return { active, direction: dirParam };
  });

  protected readonly columns: readonly DataTableColumn<Income>[] = [
    {
      key: 'receiptNumber',
      label: 'Recibo',
      value: (income) => income.receiptNumber,
      cellClass: 'font-mono',
      hideable: false,
    },
    {
      key: 'incomeDate',
      label: 'Fecha',
      value: (income) => income.incomeDate,
      cellClass: 'tabular-nums whitespace-nowrap',
    },
    {
      key: 'supplier',
      label: 'Proveedor',
      value: (income) => income.supplier?.name ?? '—',
    },
    {
      key: 'totalAmount',
      label: 'Total',
      value: (income) => formatCurrency(income.totalAmount),
      cellClass: 'tabular-nums text-right whitespace-nowrap',
      headerClass: 'text-right',
      align: 'end',
    },
    {
      key: 'tax',
      label: 'Impuesto %',
      value: (income) => `${income.tax} %`,
      cellClass: 'tabular-nums text-right',
      headerClass: 'text-right',
      align: 'end',
    },
  ] as const;

  protected readonly trackByReceiptNumber = (_: number, row: Income): string => row.receiptNumber;

  constructor() {
    // Refetch the page whenever the URL state changes. Wiring it as an effect over the
    // signal-derived query lets back/forward navigation, refresh and a direct link all
    // converge on the same single source of truth — no separate "I just clicked the
    // paginator" path.
    effect(() => {
      const params: IncomePageQuery = {
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
      };
      this.service.loadPage(params).subscribe({ error: () => undefined });
    });

    // Clear the selection on every page change so action buttons that depend on the
    // selected row reflect reality.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.selectedIncome.set(null));
  }

  /** Handler for the data-table paginator. Writes the new page into the URL. */
  protected onPageChange(event: { pageIndex: number; pageSize: number }): void {
    this.pushToUrl({
      page: event.pageIndex,
      size: event.pageSize,
    });
  }

  /** Handler for the data-table sort header. Writes the new sort into the URL. */
  protected onSortChange(sort: DataTableSort | null): void {
    if (sort === null || sort.direction === '') {
      this.pushToUrl({ sortBy: null, sortDir: null, page: 0 });
      return;
    }
    this.pushToUrl({
      sortBy: sort.active,
      sortDir: sort.direction === 'asc' ? 'asc' : 'desc',
      page: 0,
    });
  }

  /**
   * Writes a partial query update to the URL. Null values are removed from the URL so the
   * link stays clean when the user goes back to a default. Uses `replaceUrl` so the back
   * stack does not accumulate one entry per page change.
   */
  private pushToUrl(patch: Record<string, string | number | null>): void {
    const next: Record<string, string | undefined> = {};
    const current = this.route.snapshot.queryParamMap;
    for (const key of current.keys) {
      next[key] = current.get(key) ?? undefined;
    }
    for (const [key, value] of Object.entries(patch)) {
      next[key] = value === null || value === undefined ? undefined : String(value);
    }
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: next,
      replaceUrl: true,
    });
  }

  protected onRefresh(): void {
    this.selectedIncome.set(null);
    this.service
      .loadPage({
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
      })
      .subscribe({ error: () => undefined });
  }

  protected onShowDetail(): void {
    const income = this.selectedIncome();
    if (!income) {
      return;
    }
    this.dialog.open(IncomeDetailDialogComponent, {
      data: income,
      width: '640px',
      maxWidth: '95vw',
    });
  }

  protected onEdit(): void {
    const income = this.selectedIncome();
    if (!income) {
      return;
    }
    void this.router.navigate(['/ingresos', income.receiptNumber, 'editar']);
  }

  protected onDelete(): void {
    const income = this.selectedIncome();
    if (!income) {
      return;
    }
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar ingreso',
        message: `¿Estás seguro de querer eliminar el recibo ${income.receiptNumber}?`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        destructive: true,
      },
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed !== true) {
        return;
      }
      // Optimistic delete: the row disappears from the local snapshot immediately, then
      // we refetch the current page to keep the totals + sort order honest.
      this.service.removeFromCachedPage(income.receiptNumber);

      this.service.delete(income.receiptNumber).subscribe({
        next: () => {
          this.selectedIncome.set(null);
          this.snackBar.open('Ingreso eliminado', 'Cerrar');
          this.onRefresh();
        },
        error: () => {
          // Reconcile against the server — the row we hid may still exist.
          this.onRefresh();
          this.snackBar.open('No se pudo eliminar el ingreso', 'Cerrar');
        },
      });
    });
  }
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}
