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
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  DataTableComponent,
  type DataTableAutocompleteOption,
  type DataTableColumn,
  type DataTableColumnFilterValue,
  type DataTableEmptyState,
} from '../../../shared/data-table';
import { formatDateTime } from '../../../shared/format';
import { FreshnessIndicatorComponent, useVisibilityRefresh } from '../../../shared/freshness';
import { ItemBinDetailDialogComponent } from '../components/item-bin-detail-dialog.component';
import { ItemService } from '../item.service';
import type { Item, ItemBinPageQuery } from '../item.types';

/**
 * Admin-only "Papelera" surface for soft-deleted items. Backed by
 * `GET /api/v1/items/deleted` — the backend filters every operational read on
 * `deletedAt is null`, so this page is the single entry point to the removed
 * records.
 *
 * <h3>Per-column filters</h3>
 *
 * Mirrors the active items list UX (same column titles + filter types) plus
 * the audit columns. Sort is intentionally off on every column because the
 * backend exposes a fixed sort (most-recent-deleted first).
 *
 * <ul>
 *   <li><b>Código</b> (text) → backend `code`.</li>
 *   <li><b>Nombre</b> (text) → backend `name`.</li>
 *   <li><b>Categoría</b> (autocomplete) → backend `categoryName`. Options
 *       sourced from the distinct category names of the currently loaded rows.</li>
 *   <li><b>Marca</b> (autocomplete) → backend `brandName`. Same source as
 *       categoría.</li>
 *   <li><b>Eliminado</b> (dateRange) → backend `deletedFrom` / `deletedTo`.
 *       The data-table emits ISO date strings; we convert each end to an
 *       instant anchored to Argentina local time before hitting the endpoint.</li>
 *   <li><b>Eliminado por</b> (text) → backend `deletedBy` (substring on the
 *       admin email captured at delete time).</li>
 * </ul>
 *
 * <h3>Read-only by design</h3>
 *
 * No restore / purge actions. Re-creating a deleted item goes through the
 * regular `/items/nuevo` flow.
 *
 * <h3>URL-sync of state</h3>
 *
 * Pagination + filters live in the URL. Browser back / forward / refresh /
 * shareable link restore the exact view.
 */
@Component({
  selector: 'app-item-bin-page',
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
  templateUrl: './item-bin.page.html',
  styleUrl: './item-bin.page.scss',
})
export class ItemBinPage {
  private readonly service = inject(ItemService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly dialog = inject(MatDialog);

  protected readonly loading = this.service.binLoading;
  protected readonly error = this.service.binError;
  protected readonly rows = this.service.binRows;
  protected readonly totalElements = this.service.binTotalElements;
  protected readonly pageFetchedAt = this.service.binFetchedAt;

  protected readonly selectedItem = signal<Item | null>(null);
  protected readonly hasSelection = computed(() => this.selectedItem() !== null);

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
    code: this.query().get('code') ?? '',
    name: this.query().get('name') ?? '',
    categoryName: this.query().get('categoryName') ?? '',
    brandName: this.query().get('brandName') ?? '',
    deletedBy: this.query().get('deletedBy') ?? '',
    deletedFrom: this.query().get('deletedFrom') ?? null,
    deletedTo: this.query().get('deletedTo') ?? null,
  }));

  protected readonly columnFilters = computed<ReadonlyMap<string, DataTableColumnFilterValue>>(
    () => {
      const f = this.filterState();
      const map = new Map<string, DataTableColumnFilterValue>();
      if (f.code.length > 0) {
        map.set('code', { type: 'text', value: f.code });
      }
      if (f.name.length > 0) {
        map.set('name', { type: 'text', value: f.name });
      }
      if (f.categoryName.length > 0) {
        map.set('category', {
          type: 'autocomplete',
          value: f.categoryName,
          label: f.categoryName,
        });
      }
      if (f.brandName.length > 0) {
        map.set('brand', { type: 'autocomplete', value: f.brandName, label: f.brandName });
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
      f.code.length > 0 ||
      f.name.length > 0 ||
      f.categoryName.length > 0 ||
      f.brandName.length > 0 ||
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
      body: 'No hay items eliminados.',
    };
  });

  /** Distinct category / brand names derived from the currently loaded page's rows. */
  private readonly categoryOptions = (): readonly DataTableAutocompleteOption[] => {
    const distinct = new Set<string>();
    for (const item of this.rows()) {
      if (item.category?.name) distinct.add(item.category.name);
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name }));
  };

  private readonly brandOptions = (): readonly DataTableAutocompleteOption[] => {
    const distinct = new Set<string>();
    for (const item of this.rows()) {
      if (item.brand?.name) distinct.add(item.brand.name);
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name }));
  };

  protected readonly columns = computed<readonly DataTableColumn<Item>[]>(() => [
    {
      key: 'code',
      label: 'Código',
      value: (item) => item.code,
      hideable: false,
      sortable: false,
      filter: 'text',
      cellClass: 'font-mono',
    },
    {
      key: 'name',
      label: 'Nombre',
      value: (item) => item.name,
      sortable: false,
      filter: 'text',
    },
    {
      key: 'category',
      label: 'Categoría',
      value: (item) => item.category?.name ?? '—',
      sortable: false,
      filter: 'autocomplete',
      autocomplete: {
        options: this.categoryOptions,
        placeholder: 'Buscar categoría',
      },
    },
    {
      key: 'brand',
      label: 'Marca',
      value: (item) => item.brand?.name ?? '—',
      sortable: false,
      filter: 'autocomplete',
      autocomplete: {
        options: this.brandOptions,
        placeholder: 'Buscar marca',
      },
    },
    {
      // See plan-bin.page.ts: format directly in the value accessor since the
      // column is non-sortable (server-side sort is fixed at deletedAt desc),
      // so we do not need a cellTemplate to preserve the raw ISO for ordering.
      key: 'deletedAt',
      label: 'Eliminado',
      value: (item) => (item.deletedAt ? formatDateTime(item.deletedAt) : '—'),
      cellClass: 'tabular-nums whitespace-nowrap',
      sortable: false,
      hideable: false,
      filter: 'dateRange',
    },
    {
      key: 'deletedBy',
      label: 'Eliminado por',
      value: (item) => item.deletedBy ?? '—',
      sortable: false,
      filter: 'text',
    },
  ]);

  protected readonly trackByCode = (_: number, row: Item): string => row.code;

  constructor() {
    effect(() => {
      const f = this.filterState();
      const params: ItemBinPageQuery = {
        page: this.pageIndex(),
        limit: this.pageSize(),
        code: f.code || undefined,
        name: f.name || undefined,
        categoryName: f.categoryName || undefined,
        brandName: f.brandName || undefined,
        deletedBy: f.deletedBy || undefined,
        deletedFrom: f.deletedFrom ? argDateToInstant(f.deletedFrom, 'start') : undefined,
        deletedTo: f.deletedTo ? argDateToInstant(f.deletedTo, 'end') : undefined,
      };
      this.service.loadDeletedPage(params).subscribe({ error: () => undefined });
    });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.selectedItem.set(null));

    useVisibilityRefresh(this.pageFetchedAt, () => this.onRefresh());
  }

  protected onColumnMenuApply(event: {
    key: string;
    filter: DataTableColumnFilterValue | null;
  }): void {
    const patch: Record<string, string | number | null> = { page: 0 };

    if (event.key === 'code') {
      patch['code'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'name') {
      patch['name'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'category') {
      patch['categoryName'] = event.filter?.type === 'autocomplete' ? event.filter.value : null;
    } else if (event.key === 'brand') {
      patch['brandName'] = event.filter?.type === 'autocomplete' ? event.filter.value : null;
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
      code: null,
      name: null,
      categoryName: null,
      brandName: null,
      deletedBy: null,
      deletedFrom: null,
      deletedTo: null,
      page: 0,
    });
  }

  protected onRefresh(): void {
    this.selectedItem.set(null);
    const f = this.filterState();
    this.service
      .loadDeletedPage({
        page: this.pageIndex(),
        limit: this.pageSize(),
        code: f.code || undefined,
        name: f.name || undefined,
        categoryName: f.categoryName || undefined,
        brandName: f.brandName || undefined,
        deletedBy: f.deletedBy || undefined,
        deletedFrom: f.deletedFrom ? argDateToInstant(f.deletedFrom, 'start') : undefined,
        deletedTo: f.deletedTo ? argDateToInstant(f.deletedTo, 'end') : undefined,
      })
      .subscribe({ error: () => undefined });
  }

  /**
   * Opens the read-only papelera detail dialog for the currently-selected
   * item. The bin already holds the full {@link Item} in memory, so a dialog
   * over that data is the single-source-of-truth approach (a dedicated route
   * would have to re-fetch through a path that filters out soft-deleted rows).
   */
  protected onShowDetail(): void {
    const item = this.selectedItem();
    if (!item) {
      return;
    }
    this.dialog.open(ItemBinDetailDialogComponent, {
      data: item,
      width: '560px',
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
 * anchored to Argentina local time. Same helper used by the funeral / affiliate
 * / plan bin pages. Argentina is UTC-3 with no DST, so the offset is a constant.
 */
function argDateToInstant(isoDate: string, bound: 'start' | 'end'): string {
  const time = bound === 'start' ? '00:00:00.000' : '23:59:59.999';
  return new Date(`${isoDate}T${time}-03:00`).toISOString();
}
