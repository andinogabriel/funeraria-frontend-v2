import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs/operators';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import {
  DataTableComponent,
  type DataTableColumn,
  type DataTableSort,
} from '../../../shared/data-table';
import { SupplierService } from '../../suppliers/supplier.service';
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
 * Pagination (`page`, `size`, `sortBy`, `sortDir`) AND filters (`q`, `supplierNif`,
 * `from`, `to`) all live in the URL. The browser back button restores the previous slice,
 * a refresh keeps the filter, and a link to a filtered + paginated view can be shared with
 * another operator. The component reads the URL on init + every time it changes, and
 * writes back through `router.navigate` with `replaceUrl: true` so the back stack does not
 * accumulate one entry per keystroke.
 *
 * <h3>Filter debouncing</h3>
 *
 * The filter FormGroup's `valueChanges` is debounced 250 ms before each push to the URL.
 * That keeps the URL bar quiet while the operator is typing in the search field, and the
 * supplier picker / date pickers still feel immediate because they emit one change per
 * interaction.
 *
 * <h3>Stale-while-revalidate</h3>
 *
 * The previous page's rows stay visible while a new page is loading so the table does not
 * flash a skeleton between clicks; an "Actualizando…" hint appears next to the action
 * toolbar so the operator knows a request is in flight.
 */
@Component({
  selector: 'app-income-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataTableComponent,
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './income-list.page.html',
  styleUrl: './income-list.page.scss',
})
export class IncomeListPage {
  private readonly fb = inject(NonNullableFormBuilder);
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
  protected readonly suppliers = this.supplierService.list;

  protected readonly selectedIncome = signal<Income | null>(null);
  protected readonly hasSelection = computed(() => this.selectedIncome() !== null);

  /** Reactive snapshot of the URL query params — drives the backend call. */
  protected readonly query = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });

  /** Filter FormGroup. Bound to the inputs in the template. Synced both ways with the URL. */
  protected readonly filterForm = this.fb.group({
    q: this.fb.control<string>(''),
    supplierNif: this.fb.control<string | null>(null),
    from: this.fb.control<Date | null>(null),
    to: this.fb.control<Date | null>(null),
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

  /** Filter values parsed from the URL — feed into the backend call and the form. */
  protected readonly filterState = computed(() => ({
    q: this.query().get('q') ?? '',
    supplierNif: this.query().get('supplierNif') ?? null,
    from: this.query().get('from') ?? null,
    to: this.query().get('to') ?? null,
  }));

  /** `true` when any filter is active — drives the "limpiar filtros" affordance. */
  protected readonly hasActiveFilters = computed(() => {
    const f = this.filterState();
    return f.q.length > 0 || f.supplierNif !== null || f.from !== null || f.to !== null;
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
    // Catalog: suppliers feed the picker. Admin-only on the backend; the page itself is
    // admin-gated so the call is safe to fire unconditionally on init.
    this.supplierService.loadAll().subscribe({ error: () => undefined });

    // URL → form sync. Patch the form whenever the URL changes (back button, refresh,
    // direct link) so the inputs reflect the active filters. `emitEvent: false` short-
    // circuits the inverse "form → URL" pipe so the patch never loops back.
    effect(() => {
      const f = this.filterState();
      this.filterForm.patchValue(
        {
          q: f.q,
          supplierNif: f.supplierNif,
          from: f.from === null ? null : parseIsoDate(f.from),
          to: f.to === null ? null : parseIsoDate(f.to),
        },
        { emitEvent: false },
      );
    });

    // Form → URL sync. 250 ms debounce so the URL bar stays quiet while the operator is
    // mid-typing in the search field; supplier / date pickers still feel instant because
    // they emit one change per interaction. Filter changes reset the page to 0 — staying
    // on page 5 after applying a filter that returns one page would render an empty grid.
    this.filterForm.valueChanges
      .pipe(debounceTime(250), takeUntilDestroyed())
      .subscribe((value) => {
        this.pushToUrl({
          q: trimmedOrNull(value.q ?? ''),
          supplierNif: value.supplierNif ?? null,
          from: value.from ? toIsoDate(value.from) : null,
          to: value.to ? toIsoDate(value.to) : null,
          page: 0,
        });
      });

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
        supplierNif: f.supplierNif ?? undefined,
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

  /** Clears the four filter inputs in one click. */
  protected onClearFilters(): void {
    this.filterForm.reset({ q: '', supplierNif: null, from: null, to: null });
  }

  /**
   * Writes a partial query update to the URL. Null values are removed from the URL so the
   * link stays clean when the user goes back to a default. Uses `replaceUrl` so the back
   * stack does not accumulate one entry per keystroke.
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
        supplierNif: f.supplierNif ?? undefined,
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

/** Returns the trimmed string, or `null` when the result is empty. */
function trimmedOrNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Converts a JS Date to the ISO `yyyy-MM-dd` string the backend filter expects. */
function toIsoDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Parses ISO `yyyy-MM-dd` back to a JS Date for the datepicker. Returns `null` for
 * malformed input so the form does not wedge with `Invalid Date`.
 */
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}
