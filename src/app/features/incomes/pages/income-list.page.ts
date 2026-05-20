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
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import {
  DataTableComponent,
  type DataTableColumn,
  type DataTableColumnFilterValue,
  type DataTableEmptyState,
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
 * <h3>Touch-first data table (replaces the legacy top-bar filters)</h3>
 *
 * All filter inputs live inside the per-column header menus the data-table now ships
 * with. The page no longer renders a FormGroup with q / supplierNif / from / to
 * controls above the grid; instead, each column declares its filter type, the user
 * taps the column name to open a menu, types / picks a value, and the data-table
 * emits `(columnFilterChange)` (debounced 250 ms). The page maps each column's
 * filter to the backend filter param that semantically matches:
 *
 * - `receiptNumber` (`Recibo`) text filter → `q` (the backend multi-purpose search
 *   already matches receipt numbers + supplier name + supplier nif).
 * - `incomeDate` (`Fecha`) dateRange filter → `from` / `to`.
 * - Other columns expose sort-only menus.
 *
 * <h3>URL-sync of state</h3>
 *
 * Pagination (`page`, `size`, `sortBy`, `sortDir`) AND filters (`q`, `from`, `to`)
 * all live in the URL. Browser back / forward / refresh / shareable link all work
 * because the page reads the URL on init + every change, drives the data-table
 * inputs from those signals, and writes back through `router.navigate({ replaceUrl })`.
 *
 * <h3>Stale-while-revalidate</h3>
 *
 * The previous page's rows stay visible while a new page is loading so the table
 * does not flash a skeleton between clicks; an "Actualizando…" hint appears next to
 * the action toolbar so the operator knows a request is in flight.
 */
@Component({
  selector: 'app-income-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, MatButtonModule, MatIconModule, MatTooltipModule, RouterLink],
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

  /** Page size parsed from the URL; defaults to 10 (matches the data-table fixed height). */
  protected readonly pageSize = computed(() => {
    const raw = this.query().get('size');
    const parsed = raw === null ? 10 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  });

  /** Sort state parsed from the URL; defaults to `incomeDate desc`. */
  protected readonly sortState = computed<DataTableSort>(() => {
    const active = this.query().get('sortBy') ?? 'incomeDate';
    const dirParam = (this.query().get('sortDir') ?? 'desc') as 'asc' | 'desc';
    return { active, direction: dirParam };
  });

  /** Filter values parsed from the URL — feed into the backend call and the data-table. */
  protected readonly filterState = computed(() => ({
    q: this.query().get('q') ?? '',
    from: this.query().get('from') ?? null,
    to: this.query().get('to') ?? null,
  }));

  /**
   * Per-column filter map passed into the data-table. Maps the URL filter state back
   * into the discriminated-union shape the table expects. The page is the source of
   * truth (URL); the data-table is a controlled renderer that re-emits user edits
   * through `(columnFilterChange)`.
   */
  protected readonly columnFilters = computed<ReadonlyMap<string, DataTableColumnFilterValue>>(
    () => {
      const f = this.filterState();
      const map = new Map<string, DataTableColumnFilterValue>();
      if (f.q.length > 0) {
        map.set('receiptNumber', { type: 'text', value: f.q });
      }
      if (f.from !== null || f.to !== null) {
        map.set('incomeDate', { type: 'dateRange', from: f.from, to: f.to });
      }
      return map;
    },
  );

  /** `true` when any filter is active — drives the "limpiar filtros" affordance. */
  protected readonly hasActiveFilters = computed(() => {
    const f = this.filterState();
    return f.q.length > 0 || f.from !== null || f.to !== null;
  });

  /** Empty-state config rendered inside the table when totalElements === 0. */
  protected readonly emptyState = computed<DataTableEmptyState>(() =>
    this.hasActiveFilters()
      ? {
          icon: 'filter_alt_off',
          title: 'Sin resultados',
          body: 'Ajustá o limpiá los filtros para volver a ver el listado completo.',
        }
      : {
          icon: 'receipt_long',
          title: 'No hay ingresos registrados',
          body: 'Sumá uno desde «Nuevo ingreso» arriba a la derecha.',
        },
  );

  protected readonly columns: readonly DataTableColumn<Income>[] = [
    {
      key: 'receiptNumber',
      label: 'Recibo',
      value: (income) => income.receiptNumber,
      cellClass: 'font-mono',
      hideable: false,
      filter: 'text',
    },
    {
      key: 'incomeDate',
      label: 'Fecha',
      value: (income) => income.incomeDate,
      cellClass: 'tabular-nums whitespace-nowrap',
      filter: 'dateRange',
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
    // URL → backend. Re-fetches the page whenever any URL param changes. Back / forward
    // navigation, refresh, manual filter change and paginator click all converge here so
    // there's a single source of truth for "load the right slice".
    effect(() => {
      const f = this.filterState();
      const params: IncomePageQuery = {
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
        q: f.q || undefined,
        from: f.from ?? undefined,
        to: f.to ?? undefined,
      };
      this.service.loadPage(params).subscribe({ error: () => undefined });
    });

    // Clear the selection on every URL change so action buttons that depend on it reflect
    // reality (the selected row may not even exist in the new slice).
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.selectedIncome.set(null));
  }

  /**
   * Handler for the data-table's column-menu filter. Maps each column key to the
   * backend filter param it semantically owns. `value === null` means "filter
   * cleared" and the corresponding URL params drop out via `pushToUrl(null)`.
   */
  protected onColumnFilterChange(event: {
    key: string;
    value: DataTableColumnFilterValue | null;
  }): void {
    if (event.key === 'receiptNumber') {
      const text = event.value && event.value.type === 'text' ? event.value.value : null;
      this.pushToUrl({ q: text, page: 0 });
      return;
    }
    if (event.key === 'incomeDate') {
      if (event.value === null) {
        this.pushToUrl({ from: null, to: null, page: 0 });
        return;
      }
      if (event.value.type === 'dateRange') {
        this.pushToUrl({ from: event.value.from, to: event.value.to, page: 0 });
      }
    }
    // Other column keys without a backend mapping are silently ignored — the data-
    // table will still apply visual feedback (active-filter dot) so the operator
    // can see their input is registered locally, but no URL change happens.
  }

  /** Handler for the data-table paginator. Writes the new page into the URL. */
  protected onPageChange(event: { pageIndex: number; pageSize: number }): void {
    this.pushToUrl({
      page: event.pageIndex,
      size: event.pageSize,
    });
  }

  /** Handler for the data-table sort menu. Writes the new sort into the URL. */
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

  /** Clears every active filter in one tap; URL goes back to default-sort + page 0. */
  protected onClearFilters(): void {
    this.pushToUrl({ q: null, from: null, to: null, page: 0 });
  }

  /**
   * Writes a partial query update to the URL. Null values are removed from the URL so
   * the link stays clean when the user goes back to a default. Uses `replaceUrl` so
   * the back stack does not accumulate one entry per keystroke.
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
    const f = this.filterState();
    this.service
      .loadPage({
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
        q: f.q || undefined,
        from: f.from ?? undefined,
        to: f.to ?? undefined,
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
      this.service.removeFromCachedPage(income.receiptNumber);

      this.service.delete(income.receiptNumber).subscribe({
        next: () => {
          this.selectedIncome.set(null);
          this.snackBar.open('Ingreso eliminado', 'Cerrar');
          this.onRefresh();
        },
        error: () => {
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
