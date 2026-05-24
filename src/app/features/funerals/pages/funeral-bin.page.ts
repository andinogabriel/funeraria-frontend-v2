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
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  DataTableComponent,
  type DataTableColumn,
  type DataTableColumnFilterValue,
  type DataTableEmptyState,
} from '../../../shared/data-table';
import { formatDateTime } from '../../../shared/format';
import { FreshnessIndicatorComponent, useVisibilityRefresh } from '../../../shared/freshness';
import { FuneralBinDetailDialogComponent } from '../components/funeral-bin-detail-dialog.component';
import { FuneralService } from '../funeral.service';
import type { Funeral, FuneralBinPageQuery } from '../funeral.types';

/**
 * Admin-only "Papelera" surface for soft-deleted funerals. Backed by
 * `GET /api/v1/funerals/deleted` — the backend filters every operational read
 * on `deletedAt is null`, so this page is the single entry point to the
 * removed records.
 *
 * <h3>Per-column filters</h3>
 *
 * Mirrors the active-listing UX. Sort is intentionally off on every column
 * because the backend exposes a fixed sort (most-recent-deleted first) by
 * contract — same approach used on `/auditoria`.
 *
 * <ul>
 *   <li><b>Fallecido</b> (text) → backend `deceasedName`.</li>
 *   <li><b>DNI</b> (text) → backend `dni`.</li>
 *   <li><b>Recibo</b> (text) → backend `receiptNumber`.</li>
 *   <li><b>Eliminado</b> (dateRange) → backend `deletedFrom` / `deletedTo`.
 *       The data-table emits ISO date strings (`yyyy-MM-dd`); we convert each
 *       end to an instant anchored to Argentina local time before hitting the
 *       endpoint.</li>
 *   <li><b>Eliminado por</b> (text) → backend `deletedBy` (substring on the
 *       admin email captured at delete time).</li>
 * </ul>
 *
 * <h3>Read-only by design</h3>
 *
 * No restore / purge actions. Re-creating a deleted service goes through the
 * regular `/servicios/nuevo` flow — the original receipt number stays taken
 * (product decision).
 *
 * <h3>URL-sync of state</h3>
 *
 * Pagination + filters live in the URL. Browser back / forward / refresh /
 * shareable link restore the exact view.
 */
@Component({
  selector: 'app-funeral-bin-page',
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
  templateUrl: './funeral-bin.page.html',
  styleUrl: './funeral-bin.page.scss',
})
export class FuneralBinPage {
  private readonly service = inject(FuneralService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);

  protected readonly loading = this.service.binLoading;
  protected readonly error = this.service.binError;
  protected readonly rows = this.service.binRows;
  protected readonly totalElements = this.service.binTotalElements;
  protected readonly pageFetchedAt = this.service.binFetchedAt;

  protected readonly selectedFuneral = signal<Funeral | null>(null);
  protected readonly hasSelection = computed(() => this.selectedFuneral() !== null);

  /** Reactive snapshot of the URL query params — drives the backend call. */
  private readonly query = toSignal(this.route.queryParamMap, {
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

  protected readonly filterState = computed(() => ({
    deceasedName: this.query().get('deceasedName') ?? '',
    dni: this.query().get('dni') ?? '',
    receiptNumber: this.query().get('receiptNumber') ?? '',
    deletedBy: this.query().get('deletedBy') ?? '',
    deletedFrom: this.query().get('deletedFrom') ?? null,
    deletedTo: this.query().get('deletedTo') ?? null,
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
      if (f.deletedBy.length > 0) {
        map.set('deletedBy', { type: 'text', value: f.deletedBy });
      }
      if (f.deletedFrom !== null || f.deletedTo !== null) {
        map.set('deletedAt', { type: 'dateRange', from: f.deletedFrom, to: f.deletedTo });
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
      f.deletedBy.length > 0 ||
      f.deletedFrom !== null ||
      f.deletedTo !== null
    );
  });

  protected readonly emptyState = computed<DataTableEmptyState>(() => {
    if (this.hasActiveFilters()) {
      return {
        icon: 'filter_alt_off',
        title: 'Sin resultados',
        body: 'Ajustá o limpiá los filtros para volver a ver la papelera completa.',
      };
    }
    if (this.totalElements() > 0 && this.pageIndex() > 0) {
      return {
        icon: 'pageview',
        title: 'Esta página está vacía',
        body: 'El URL apunta a una página que no contiene datos. Volvé al inicio.',
        action: {
          label: 'Ir a la primera página',
          icon: 'first_page',
          handler: () => this.pushToUrl({ page: 0 }),
        },
      };
    }
    return {
      icon: 'delete_outline',
      title: 'Papelera vacía',
      body: 'No hay servicios eliminados.',
    };
  });

  /**
   * Template refs for the Fecha + Eliminado cells. Both columns ship the raw
   * ISO string from `value` so sorting (if ever enabled) stays chronological;
   * the cell templates run the canonical `formatDateTime` so the operator
   * sees `dd/MM/yyyy HH:mm` in Argentina local time.
   */
  private readonly funeralDateCell =
    viewChild<TemplateRef<{ $implicit: Funeral }>>('funeralDateCell');
  private readonly deletedAtCell = viewChild<TemplateRef<{ $implicit: Funeral }>>('deletedAtCell');

  /** Bound to the cell templates. */
  protected readonly formatDateTime = formatDateTime;

  protected readonly columns = computed<readonly DataTableColumn<Funeral>[]>(() => [
    {
      key: 'deceasedName',
      label: 'Fallecido',
      value: (f) => `${f.deceased.firstName} ${f.deceased.lastName}`,
      hideable: false,
      sortable: false,
      filter: 'text',
    },
    {
      key: 'dni',
      label: 'DNI',
      value: (f) => f.deceased.dni,
      cellClass: 'font-mono tabular-nums',
      sortable: false,
      filter: 'text',
    },
    {
      key: 'receiptNumber',
      label: 'Recibo',
      value: (f) => f.receiptNumber ?? '',
      cellClass: 'font-mono',
      sortable: false,
      filter: 'text',
    },
    {
      key: 'funeralDate',
      label: 'Fecha del servicio',
      value: (f) => f.funeralDate,
      cellTemplate: this.funeralDateCell(),
      cellClass: 'tabular-nums whitespace-nowrap',
      sortable: false,
    },
    {
      key: 'deletedAt',
      label: 'Eliminado',
      value: (f) => f.deletedAt,
      cellTemplate: this.deletedAtCell(),
      cellClass: 'tabular-nums whitespace-nowrap',
      sortable: false,
      hideable: false,
      filter: 'dateRange',
    },
    {
      key: 'deletedBy',
      label: 'Eliminado por',
      value: (f) => f.deletedBy,
      sortable: false,
      filter: 'text',
    },
  ]);

  protected readonly trackById = (_: number, row: Funeral): number => row.id;

  constructor() {
    effect(() => {
      const f = this.filterState();
      const params: FuneralBinPageQuery = {
        page: this.pageIndex(),
        limit: this.pageSize(),
        deceasedName: f.deceasedName || undefined,
        dni: f.dni || undefined,
        receiptNumber: f.receiptNumber || undefined,
        deletedBy: f.deletedBy || undefined,
        deletedFrom: f.deletedFrom ? argDateToInstant(f.deletedFrom, 'start') : undefined,
        deletedTo: f.deletedTo ? argDateToInstant(f.deletedTo, 'end') : undefined,
      };
      this.service.loadDeletedPage(params).subscribe({ error: () => undefined });
    });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.selectedFuneral.set(null));

    useVisibilityRefresh(this.pageFetchedAt, () => this.onRefresh());
  }

  protected onColumnMenuApply(event: {
    key: string;
    filter: DataTableColumnFilterValue | null;
  }): void {
    const patch: Record<string, string | number | null> = { page: 0 };

    if (event.key === 'deceasedName') {
      patch['deceasedName'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'dni') {
      patch['dni'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'receiptNumber') {
      patch['receiptNumber'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'deletedBy') {
      patch['deletedBy'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'deletedAt') {
      if (event.filter?.type === 'dateRange') {
        patch['deletedFrom'] = event.filter.from;
        patch['deletedTo'] = event.filter.to;
      } else {
        patch['deletedFrom'] = null;
        patch['deletedTo'] = null;
      }
    }

    this.pushToUrl(patch);
  }

  protected onPageChange(event: { pageIndex: number; pageSize: number }): void {
    this.pushToUrl({ page: event.pageIndex, size: event.pageSize });
  }

  protected onClearFilters(): void {
    this.pushToUrl({
      deceasedName: null,
      dni: null,
      receiptNumber: null,
      deletedBy: null,
      deletedFrom: null,
      deletedTo: null,
      page: 0,
    });
  }

  protected onRefresh(): void {
    this.selectedFuneral.set(null);
    const f = this.filterState();
    this.service
      .loadDeletedPage({
        page: this.pageIndex(),
        limit: this.pageSize(),
        deceasedName: f.deceasedName || undefined,
        dni: f.dni || undefined,
        receiptNumber: f.receiptNumber || undefined,
        deletedBy: f.deletedBy || undefined,
        deletedFrom: f.deletedFrom ? argDateToInstant(f.deletedFrom, 'start') : undefined,
        deletedTo: f.deletedTo ? argDateToInstant(f.deletedTo, 'end') : undefined,
      })
      .subscribe({ error: () => undefined });
  }

  /**
   * Opens the read-only papelera detail dialog for the currently-selected
   * funeral. We open a dialog instead of navigating to {@code /servicios/:id}
   * because that route relies on cache reads that filter out soft-deleted
   * rows — the bin already holds the full {@link Funeral} in memory, so a
   * dialog over that data is the single-source-of-truth approach.
   */
  protected onShowDetail(): void {
    const funeral = this.selectedFuneral();
    if (!funeral) {
      return;
    }
    this.dialog.open(FuneralBinDetailDialogComponent, {
      data: funeral,
      width: '640px',
      maxWidth: '95vw',
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
}

/**
 * Converts a {@code yyyy-MM-dd} string into the matching ISO-8601 instant
 * anchored to Argentina local time. Same helper used by the audit / affiliate-
 * bin pages. Argentina is UTC-3 with no DST, so the offset is a constant.
 */
function argDateToInstant(isoDate: string, bound: 'start' | 'end'): string {
  const time = bound === 'start' ? '00:00:00.000' : '23:59:59.999';
  return new Date(`${isoDate}T${time}-03:00`).toISOString();
}
