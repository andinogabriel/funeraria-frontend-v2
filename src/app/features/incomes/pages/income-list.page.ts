import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import {
  DataTableComponent,
  type DataTableAutocompleteOption,
  type DataTableColumn,
  type DataTableColumnFilterValue,
  type DataTableEmptyState,
  type DataTableSort,
} from '../../../shared/data-table';
import { formatDateTime } from '../../../shared/format';
import { FreshnessIndicatorComponent, useVisibilityRefresh } from '../../../shared/freshness';
import { SupplierService } from '../../suppliers/supplier.service';
import { IncomeDetailDialogComponent } from '../components/income-detail-dialog.component';
import { IncomeService } from '../income.service';
import type { Income, IncomePageQuery } from '../income.types';

/**
 * Incomes (compras / ingresos) list page. Server-side paginated against
 * `GET /api/v1/incomes/paginated` — the table holds only the current slice and the
 * paginator's total comes from the response payload.
 *
 * <h3>Touch-first column-menu interaction</h3>
 *
 * Every filter input lives inside the per-column header menus the shared data-table
 * provides. Three column types in this page:
 *
 * <ul>
 *   <li><b>Recibo</b> (text) → backend `receiptNumber` (case-insensitive substring).
 *       Sort enabled.</li>
 *   <li><b>Fecha</b> (dateRange) → backend `from` / `to`. Sort enabled.</li>
 *   <li><b>Proveedor</b> (autocomplete) → backend `supplierNif`. The autocomplete
 *       reads the in-memory supplier catalog (`SupplierService.loadAll()`); the
 *       operator searches by name + nif, picks one, and the picked supplier's NIF is
 *       committed as the filter value. Sort intentionally disabled — sorting by a
 *       single selected supplier has no operator value.</li>
 *   <li>Total, Impuesto % → sort-only menus, no filter input.</li>
 * </ul>
 *
 * Filter inputs are staged inside each column's menu; the user clicks "Aceptar" to
 * commit (no auto-apply on debounce). Empty values are routed as `null` from the
 * data-table → the page drops the corresponding URL param.
 *
 * <h3>URL-sync of state</h3>
 *
 * Pagination (`page`, `size`, `sortBy`, `sortDir`) AND filters (`receiptNumber`,
 * `supplierNif`, `from`, `to`) all live in the URL. Browser back / forward / refresh
 * / shareable link restore the exact view — the page reads the URL on init + every
 * change, hydrates the data-table inputs from those signals, and writes back through
 * `router.navigate({ replaceUrl: true })`.
 *
 * <h3>Stale-while-revalidate</h3>
 *
 * The previous page's rows stay visible while a new page loads so the table never
 * flashes a skeleton between clicks; an "Actualizando…" hint sits next to the
 * action toolbar.
 */
@Component({
  selector: 'app-income-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataTableComponent,
    FreshnessIndicatorComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './income-list.page.html',
  styleUrl: './income-list.page.scss',
})
export class IncomeListPage {
  private readonly service = inject(IncomeService);
  private readonly supplierService = inject(SupplierService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly rows = this.service.rows;
  protected readonly totalElements = this.service.totalElements;
  protected readonly pageFetchedAt = this.service.pageFetchedAt;

  protected readonly selectedIncome = signal<Income | null>(null);
  protected readonly hasSelection = computed(() => this.selectedIncome() !== null);

  /** Reactive snapshot of the URL query params — drives the backend call. */
  protected readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  protected readonly pageIndex = computed(() => {
    const raw = this.query().get('page');
    const parsed = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  });

  protected readonly pageSize = computed(() => {
    const raw = this.query().get('size');
    const parsed = raw === null ? 10 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 10;
  });

  protected readonly sortState = computed<DataTableSort>(() => {
    const active = this.query().get('sortBy') ?? 'incomeDate';
    const dirParam = (this.query().get('sortDir') ?? 'desc') as 'asc' | 'desc';
    return { active, direction: dirParam };
  });

  /** Filter values parsed from the URL — feed into the backend call and the data-table. */
  protected readonly filterState = computed(() => ({
    receiptNumber: this.query().get('receiptNumber') ?? '',
    supplierNif: this.query().get('supplierNif') ?? '',
    from: this.query().get('from') ?? null,
    to: this.query().get('to') ?? null,
  }));

  /**
   * Per-column filter map passed into the data-table. Maps the URL filter state back
   * into the discriminated-union shape the table expects.
   */
  protected readonly columnFilters = computed<ReadonlyMap<string, DataTableColumnFilterValue>>(
    () => {
      const f = this.filterState();
      const map = new Map<string, DataTableColumnFilterValue>();
      if (f.receiptNumber.length > 0) {
        map.set('receiptNumber', { type: 'text', value: f.receiptNumber });
      }
      if (f.supplierNif.length > 0) {
        const supplier = this.supplierService.list()?.find((s) => s.nif === f.supplierNif);
        map.set('supplier', {
          type: 'autocomplete',
          value: f.supplierNif,
          label: supplier?.name ?? f.supplierNif,
        });
      }
      if (f.from !== null || f.to !== null) {
        map.set('incomeDate', { type: 'dateRange', from: f.from, to: f.to });
      }
      return map;
    },
  );

  protected readonly hasActiveFilters = computed(() => {
    const f = this.filterState();
    return (
      f.receiptNumber.length > 0 || f.supplierNif.length > 0 || f.from !== null || f.to !== null
    );
  });

  /**
   * Three-state empty message: filtered (no matches), out-of-range page, or
   * truly empty ledger. Out-of-range gets a CTA that resets the URL to
   * `page=0`.
   */
  protected readonly emptyState = computed<DataTableEmptyState>(() => {
    if (this.hasActiveFilters()) {
      return {
        icon: 'filter_alt_off',
        title: 'Sin resultados',
        body: 'Ajustá o limpiá los filtros para volver a ver el listado completo.',
      };
    }
    if (this.totalElements() > 0 && this.pageIndex() > 0) {
      return {
        icon: 'pageview',
        title: 'Esta página está vacía',
        body: 'El URL apunta a una página que no contiene datos. Volvé al inicio para ver el listado.',
        action: {
          label: 'Ir a la primera página',
          icon: 'first_page',
          handler: () => this.pushToUrl({ page: 0 }),
        },
      };
    }
    return {
      icon: 'receipt_long',
      title: 'No hay ingresos registrados',
      body: 'Sumá uno desde «Nuevo ingreso» arriba a la derecha.',
    };
  });

  /**
   * Closure passed to the supplier column's autocomplete config. Re-evaluated every
   * render so a freshly-loaded supplier catalog is picked up without re-wiring the
   * column definition. Sorted by name to keep the menu list stable.
   */
  private readonly supplierOptions = (): readonly DataTableAutocompleteOption[] => {
    const list = this.supplierService.list();
    if (!list) {
      return [];
    }
    return list
      .map((s) => ({ value: s.nif, label: `${s.name} · ${s.nif}` }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  };

  /**
   * Cell renderer for the date column. The `value` accessor stays as the raw
   * ISO 8601 string so the grid sort is chronological; the template formats
   * the value as `dd/MM/yyyy HH:mm` in the operator's local timezone — same
   * pattern the funerals list uses. Wired through `viewChild` so the column
   * descriptor (defined eagerly) can pick up the template ref after init.
   */
  private readonly incomeDateCell = viewChild<TemplateRef<{ $implicit: Income }>>('incomeDateCell');

  protected readonly columns = computed<readonly DataTableColumn<Income>[]>(() => [
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
      cellTemplate: this.incomeDateCell(),
      cellClass: 'tabular-nums whitespace-nowrap',
      filter: 'dateRange',
    },
    {
      key: 'supplier',
      label: 'Proveedor',
      value: (income) => income.supplier?.name ?? '—',
      filter: 'autocomplete',
      // Sorting by a single selected supplier carries no operator meaning, so the
      // column-menu shows only the autocomplete + Aceptar — no sort radios.
      sortable: false,
      autocomplete: {
        options: this.supplierOptions,
        minSearchChars: 3,
        placeholder: 'Buscar proveedor',
      },
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
  ]);

  protected readonly trackByReceiptNumber = (_: number, row: Income): string => row.receiptNumber;

  /** Bound to the cellTemplate ref — formats the ISO date in local timezone for the grid cell. */
  protected readonly formatDateTime = formatDateTime;

  constructor() {
    // Pre-load the supplier catalog into memory so the autocomplete inside the
    // Proveedor column menu has data the moment the operator opens it. The list lives
    // in SupplierService as a cached signal — subsequent loads are no-ops.
    this.supplierService.loadAll().subscribe({ error: () => undefined });

    // URL → backend. Re-fetches the page whenever any URL param changes.
    effect(() => {
      const f = this.filterState();
      const params: IncomePageQuery = {
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
        receiptNumber: f.receiptNumber || undefined,
        supplierNif: f.supplierNif || undefined,
        from: f.from ?? undefined,
        to: f.to ?? undefined,
      };
      this.service.loadPage(params).subscribe({ error: () => undefined });
    });

    // Clear the selection on every URL change so action buttons that depend on it
    // reflect reality.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.selectedIncome.set(null));

    // Auto-refresh on tab-focus when the cached page is older than 60 s.
    useVisibilityRefresh(this.pageFetchedAt, () => this.onRefresh());
  }

  /**
   * Single-call handler for the data-table's column-menu Aceptar. Carries both
   * filter and sort changes in one atomic patch so the router writes them in a
   * single `navigate()` call — the previous two-event flow raced on
   * `router.navigate({ replaceUrl: true })` and silently dropped the second
   * change because the second navigate read a snapshot before the first had
   * committed.
   */
  protected onColumnMenuApply(event: {
    key: string;
    filter: DataTableColumnFilterValue | null;
    sortDirection: 'asc' | 'desc' | '';
  }): void {
    // Bracket access throughout because TypeScript's
    // `noPropertyAccessFromIndexSignature` setting rejects dot-access on
    // Record<string, …>. The keys are stable URL param names, not derived
    // dynamically, so the strings stay readable.
    const patch: Record<string, string | number | null> = { page: 0 };

    if (event.key === 'receiptNumber') {
      patch['receiptNumber'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'supplier') {
      patch['supplierNif'] = event.filter?.type === 'autocomplete' ? event.filter.value : null;
    } else if (event.key === 'incomeDate') {
      if (event.filter?.type === 'dateRange') {
        patch['from'] = event.filter.from;
        patch['to'] = event.filter.to;
      } else {
        patch['from'] = null;
        patch['to'] = null;
      }
    }

    if (event.sortDirection === '') {
      patch['sortBy'] = null;
      patch['sortDir'] = null;
    } else {
      patch['sortBy'] = event.key;
      patch['sortDir'] = event.sortDirection;
    }

    this.pushToUrl(patch);
  }

  protected onPageChange(event: { pageIndex: number; pageSize: number }): void {
    this.pushToUrl({ page: event.pageIndex, size: event.pageSize });
  }

  /**
   * Sort change emitted by sort-only columns (no filter declared). Those commit
   * via click on the menu items, not via the Aceptar button, so they ride this
   * legacy event channel instead of `(columnMenuApply)`.
   */
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

  protected onClearFilters(): void {
    this.pushToUrl({ receiptNumber: null, supplierNif: null, from: null, to: null, page: 0 });
  }

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
        receiptNumber: f.receiptNumber || undefined,
        supplierNif: f.supplierNif || undefined,
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
      // See affiliate-list.page.ts for the rationale: when the operator is
      // already on the last page, no row needs to be promoted from page N+1
      // into the freed slot, so the post-success refetch is pure flicker.
      const wasLastPage = this.service.page()?.last ?? true;
      this.service.removeFromCachedPage(income.receiptNumber);

      this.service.delete(income.receiptNumber).subscribe({
        next: () => {
          this.selectedIncome.set(null);
          this.snackBar.open('Ingreso eliminado', 'Cerrar');
          if (!wasLastPage) {
            this.onRefresh();
          }
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
