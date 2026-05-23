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
import { FuneralDetailDialogComponent } from '../components/funeral-detail-dialog.component';
import { FuneralService } from '../funeral.service';
import type { Funeral, FuneralPageQuery } from '../funeral.types';

/**
 * Funerals (servicios) list page. Server-side paginated against
 * `GET /api/v1/funerals/paginated` — the table holds only the current slice and the
 * paginator's total comes from the response payload. Same shape as the affiliates /
 * incomes / items list pages.
 *
 * <h3>Column wiring</h3>
 *
 * <ul>
 *   <li><b>Fallecido</b> (text) → backend `deceasedName` (substring against
 *       firstName + ' ' + lastName).</li>
 *   <li><b>DNI</b> (text) → backend `dni`.</li>
 *   <li><b>Fecha del servicio</b> (dateRange) → backend `from` / `to`.</li>
 *   <li><b>Plan</b> (autocomplete) → backend `planName`. Options sourced from the
 *       distinct plan names of the currently loaded rows.</li>
 *   <li><b>Recibo</b> (text) → backend `receiptNumber`.</li>
 *   <li>Total → sort only, no filter.</li>
 * </ul>
 */
@Component({
  selector: 'app-funeral-list-page',
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
  templateUrl: './funeral-list.page.html',
  styleUrl: './funeral-list.page.scss',
})
export class FuneralListPage {
  private readonly service = inject(FuneralService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly rows = this.service.pageRows;
  protected readonly totalElements = this.service.totalElements;
  protected readonly pageFetchedAt = this.service.pageFetchedAt;

  protected readonly selectedFuneral = signal<Funeral | null>(null);
  protected readonly hasSelection = computed(() => this.selectedFuneral() !== null);

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
    const active = this.query().get('sortBy') ?? 'funeralDate';
    const dirParam = (this.query().get('sortDir') ?? 'desc') as 'asc' | 'desc';
    return { active, direction: dirParam };
  });

  protected readonly filterState = computed(() => ({
    deceasedName: this.query().get('deceasedName') ?? '',
    dni: this.query().get('dni') ?? '',
    receiptNumber: this.query().get('receiptNumber') ?? '',
    planName: this.query().get('planName') ?? '',
    from: this.query().get('from') ?? null,
    to: this.query().get('to') ?? null,
  }));

  protected readonly columnFilters = computed<ReadonlyMap<string, DataTableColumnFilterValue>>(
    () => {
      const f = this.filterState();
      const map = new Map<string, DataTableColumnFilterValue>();
      if (f.deceasedName.length > 0) {
        map.set('deceasedName', { type: 'text', value: f.deceasedName });
      }
      if (f.dni.length > 0) {
        map.set('dni', { type: 'text', value: f.dni });
      }
      if (f.receiptNumber.length > 0) {
        map.set('receiptNumber', { type: 'text', value: f.receiptNumber });
      }
      if (f.planName.length > 0) {
        map.set('plan', { type: 'autocomplete', value: f.planName, label: f.planName });
      }
      if (f.from !== null || f.to !== null) {
        map.set('funeralDate', { type: 'dateRange', from: f.from, to: f.to });
      }
      return map;
    },
  );

  protected readonly hasActiveFilters = computed(() => {
    const f = this.filterState();
    return (
      f.deceasedName.length > 0 ||
      f.dni.length > 0 ||
      f.receiptNumber.length > 0 ||
      f.planName.length > 0 ||
      f.from !== null ||
      f.to !== null
    );
  });

  /**
   * Three-state empty message: filtered (no matches), out-of-range page, or
   * truly empty list. Out-of-range gets a CTA that resets the URL to `page=0`.
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
      icon: 'church',
      title: 'No hay servicios registrados',
      body: 'Sumá uno desde «Nuevo servicio» arriba a la derecha.',
    };
  });

  /** Distinct plan names derived from the currently loaded page's rows. */
  private readonly planOptions = (): readonly DataTableAutocompleteOption[] => {
    const distinct = new Set<string>();
    for (const funeral of this.rows()) {
      if (funeral.plan?.name) {
        distinct.add(funeral.plan.name);
      }
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name }));
  };

  /**
   * Cell renderers for the date + currency columns. Sort uses the raw ISO / number
   * value; the cell renders the operator-facing format.
   */
  private readonly funeralDateCell =
    viewChild<TemplateRef<{ $implicit: Funeral }>>('funeralDateCell');
  private readonly totalCell = viewChild<TemplateRef<{ $implicit: Funeral }>>('totalCell');

  protected readonly columns = computed<readonly DataTableColumn<Funeral>[]>(() => [
    {
      key: 'deceasedName',
      label: 'Fallecido',
      value: (funeral) => `${funeral.deceased.firstName} ${funeral.deceased.lastName}`,
      hideable: false,
      filter: 'text',
    },
    {
      key: 'dni',
      label: 'DNI',
      value: (funeral) => funeral.deceased.dni,
      cellClass: 'tabular-nums',
      filter: 'text',
    },
    {
      key: 'funeralDate',
      label: 'Fecha del servicio',
      value: (funeral) => funeral.funeralDate,
      cellTemplate: this.funeralDateCell(),
      cellClass: 'tabular-nums whitespace-nowrap',
      filter: 'dateRange',
    },
    {
      key: 'plan',
      label: 'Plan',
      value: (funeral) => funeral.plan.name,
      filter: 'autocomplete',
      // Sorting by a single selected plan carries no operator meaning.
      sortable: false,
      autocomplete: {
        options: this.planOptions,
        placeholder: 'Buscar plan',
      },
    },
    {
      key: 'receiptNumber',
      label: 'Recibo',
      value: (funeral) => funeral.receiptNumber ?? '—',
      cellClass: 'tabular-nums',
      filter: 'text',
    },
    {
      key: 'totalAmount',
      label: 'Total',
      value: (funeral) => funeral.totalAmount,
      cellTemplate: this.totalCell(),
      cellClass: 'tabular-nums text-right whitespace-nowrap',
      headerClass: 'text-right',
      align: 'end',
    },
  ]);

  protected readonly trackById = (_: number, row: Funeral): number => row.id;

  /** Bound to the cellTemplate refs — bound as method so the template can call them. */
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatCurrency = formatCurrency;

  constructor() {
    effect(() => {
      const f = this.filterState();
      const params: FuneralPageQuery = {
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
        deceasedName: f.deceasedName || undefined,
        dni: f.dni || undefined,
        receiptNumber: f.receiptNumber || undefined,
        planName: f.planName || undefined,
        from: f.from ?? undefined,
        to: f.to ?? undefined,
      };
      this.service.loadPage(params).subscribe({ error: () => undefined });
    });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.selectedFuneral.set(null));

    // Auto-refresh on tab-focus when the cached page is older than 60 s.
    useVisibilityRefresh(this.pageFetchedAt, () => this.onRefresh());
  }

  protected onColumnMenuApply(event: {
    key: string;
    filter: DataTableColumnFilterValue | null;
    sortDirection: 'asc' | 'desc' | '';
  }): void {
    const patch: Record<string, string | number | null> = { page: 0 };

    if (event.key === 'deceasedName') {
      patch['deceasedName'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'dni') {
      patch['dni'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'receiptNumber') {
      patch['receiptNumber'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'plan') {
      patch['planName'] = event.filter?.type === 'autocomplete' ? event.filter.value : null;
    } else if (event.key === 'funeralDate') {
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
    this.pushToUrl({
      deceasedName: null,
      dni: null,
      receiptNumber: null,
      planName: null,
      from: null,
      to: null,
      page: 0,
    });
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
    this.selectedFuneral.set(null);
    const f = this.filterState();
    this.service
      .loadPage({
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
        deceasedName: f.deceasedName || undefined,
        dni: f.dni || undefined,
        receiptNumber: f.receiptNumber || undefined,
        planName: f.planName || undefined,
        from: f.from ?? undefined,
        to: f.to ?? undefined,
      })
      .subscribe({ error: () => undefined });
  }

  protected onShowDetail(): void {
    const funeral = this.selectedFuneral();
    if (!funeral) {
      return;
    }
    this.dialog.open(FuneralDetailDialogComponent, {
      data: funeral,
      width: '640px',
      maxWidth: '95vw',
    });
  }

  protected onEdit(): void {
    const funeral = this.selectedFuneral();
    if (!funeral) {
      return;
    }
    void this.router.navigate(['/servicios', funeral.id, 'editar']);
  }

  protected onDelete(): void {
    const funeral = this.selectedFuneral();
    if (!funeral) {
      return;
    }
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar servicio',
        message: `¿Estás seguro de querer eliminar el servicio de ${funeral.deceased.firstName} ${funeral.deceased.lastName} (DNI ${funeral.deceased.dni})?`,
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
      this.service.removeFromCachedPage(funeral.id);
      this.service.delete(funeral.id).subscribe({
        next: () => {
          this.selectedFuneral.set(null);
          this.snackBar.open('Servicio eliminado', 'Cerrar');
          if (!wasLastPage) {
            this.onRefresh();
          }
        },
        error: () => {
          this.onRefresh();
          this.snackBar.open('No se pudo eliminar el servicio', 'Cerrar');
        },
      });
    });
  }
}

/** Formats a numeric amount as Argentine peso currency. */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}
