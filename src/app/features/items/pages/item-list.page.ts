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

import { AuthStore } from '../../../core/auth/auth.store';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import {
  DataTableComponent,
  type DataTableAutocompleteOption,
  type DataTableColumn,
  type DataTableColumnFilterValue,
  type DataTableEmptyState,
  type DataTableSort,
} from '../../../shared/data-table';
import { FreshnessIndicatorComponent, useVisibilityRefresh } from '../../../shared/freshness';
import { withListReturnUrl } from '../../../shared/navigation';
import { ItemDetailDialogComponent } from '../components/item-detail-dialog.component';
import { ItemService } from '../item.service';
import type { Item, ItemPageQuery } from '../item.types';

/**
 * Items catalog list page. Server-side paginated against
 * `GET /api/v1/items/paginated` — the table holds only the current slice and the
 * paginator's total comes from the response payload. Same shape as the affiliates /
 * incomes list pages.
 *
 * <h3>Column wiring</h3>
 *
 * <ul>
 *   <li><b>Código</b> (text) → backend `code` (case-insensitive substring). Sort enabled.</li>
 *   <li><b>Nombre</b> (text) → backend `name`. Sort enabled.</li>
 *   <li><b>Categoría</b> (autocomplete) → backend `categoryName`. Options sourced from the
 *       distinct category names of the currently loaded rows. Sort intentionally disabled
 *       — sorting by a single selected category has no operator value.</li>
 *   <li><b>Marca</b> (autocomplete) → backend `brandName`. Same source / sort treatment as
 *       categoría.</li>
 *   <li>Precio, Stock → no filter, sort only.</li>
 * </ul>
 */
@Component({
  selector: 'app-item-list-page',
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
  templateUrl: './item-list.page.html',
  styleUrl: './item-list.page.scss',
})
export class ItemListPage {
  private readonly service = inject(ItemService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly authStore = inject(AuthStore);

  /**
   * `true` when the active session has `ROLE_ADMIN`. Gates the "Papelera"
   * header button — backend endpoint is admin-only. Same pattern used on
   * `/afiliados`, `/servicios`, and `/planes`.
   */
  protected readonly isAdmin = computed(() => this.authStore.authorities().includes('ROLE_ADMIN'));

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly rows = this.service.pageRows;
  protected readonly totalElements = this.service.totalElements;
  protected readonly pageFetchedAt = this.service.pageFetchedAt;

  protected readonly selectedItem = signal<Item | null>(null);
  protected readonly hasSelection = computed(() => this.selectedItem() !== null);

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
    const active = this.query().get('sortBy') ?? 'name';
    const dirParam = (this.query().get('sortDir') ?? 'asc') as 'asc' | 'desc';
    return { active, direction: dirParam };
  });

  protected readonly filterState = computed(() => ({
    code: this.query().get('code') ?? '',
    name: this.query().get('name') ?? '',
    categoryName: this.query().get('categoryName') ?? '',
    brandName: this.query().get('brandName') ?? '',
    lowStock: this.query().get('lowStock') === 'true',
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
      f.lowStock
    );
  });

  /**
   * Three-state empty message: filtered (no matches), out-of-range (operator
   * typed a `page` param past the end of the data), or truly empty catalog.
   * Out-of-range gets a CTA that resets the URL to `page=0`, so a one-click
   * recovery exists when the operator shared / typed a stale link.
   */
  protected readonly emptyState = computed<DataTableEmptyState>(() => {
    if (this.hasActiveFilters()) {
      return {
        icon: 'filter_alt_off',
        title: 'Sin resultados',
        body: 'Ajustá o limpiá los filtros para volver a ver el catálogo completo.',
      };
    }
    if (this.totalElements() > 0 && this.pageIndex() > 0) {
      return {
        icon: 'pageview',
        title: 'Esta página está vacía',
        body: 'El URL apunta a una página que no contiene datos. Volvé al inicio para ver el catálogo.',
        action: {
          label: 'Ir a la primera página',
          icon: 'first_page',
          handler: () => this.pushToUrl({ page: 0 }),
        },
      };
    }
    return {
      icon: 'inventory_2',
      title: 'No hay items en el catálogo',
      body: 'Sumá uno desde «Nuevo item» arriba a la derecha.',
    };
  });

  /** Distinct category names derived from the currently loaded page's rows. */
  private readonly categoryOptions = (): readonly DataTableAutocompleteOption[] => {
    const distinct = new Set<string>();
    for (const item of this.rows()) {
      if (item.category?.name) {
        distinct.add(item.category.name);
      }
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name }));
  };

  /** Distinct brand names derived from the currently loaded page's rows. */
  private readonly brandOptions = (): readonly DataTableAutocompleteOption[] => {
    const distinct = new Set<string>();
    for (const item of this.rows()) {
      if (item.brand?.name) {
        distinct.add(item.brand.name);
      }
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name }));
  };

  // Stock column cell renderer — looked up via viewChild so the column
  // definition below can thread it through `cellTemplate`. The template paints
  // the value red + bold when the item is at or below its low-stock floor so
  // the admin spots it without having to open the detail dialog. Same idiom
  // audit-event-list uses for its formatted date column.
  private readonly stockCell = viewChild<TemplateRef<{ $implicit: Item }>>('stockCell');

  /**
   * Whether the item's current stock has reached or fallen below its
   * configured `lowStockThreshold`. Drives the red highlight on the Stock
   * column AND the matching highlight inside `item-detail-dialog`. Treats a
   * null stock as not-below (services / catalog entries without inventory
   * shouldn't surface as alarms).
   */
  protected isStockBelowThreshold(item: Item): boolean {
    return item.stock !== null && item.stock <= item.lowStockThreshold;
  }

  protected readonly columns = computed<readonly DataTableColumn<Item>[]>(() => [
    {
      key: 'code',
      label: 'Código',
      value: (item) => item.code,
      cellClass: 'font-mono',
      hideable: false,
      filter: 'text',
    },
    { key: 'name', label: 'Nombre', value: (item) => item.name, filter: 'text' },
    {
      key: 'category',
      label: 'Categoría',
      value: (item) => item.category?.name ?? '',
      filter: 'autocomplete',
      sortable: false,
      autocomplete: {
        options: this.categoryOptions,
        placeholder: 'Buscar categoría',
      },
    },
    {
      key: 'brand',
      label: 'Marca',
      value: (item) => item.brand?.name ?? '',
      filter: 'autocomplete',
      sortable: false,
      autocomplete: {
        options: this.brandOptions,
        placeholder: 'Buscar marca',
      },
    },
    {
      key: 'price',
      label: 'Precio',
      value: (item) => formatCurrency(item.price),
      cellClass: 'tabular-nums text-right whitespace-nowrap',
      headerClass: 'text-right',
      align: 'end',
    },
    {
      key: 'stock',
      label: 'Stock',
      // `value` returns the raw number so sort + the column-chooser preview
      // stay numeric; the cellTemplate handles the colour.
      value: (item) => item.stock ?? 0,
      cellTemplate: this.stockCell(),
      cellClass: 'tabular-nums text-right',
      headerClass: 'text-right',
      align: 'end',
    },
  ]);

  protected readonly trackByCode = (_: number, row: Item): string => row.code;

  constructor() {
    effect(() => {
      const f = this.filterState();
      const params: ItemPageQuery = {
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
        code: f.code || undefined,
        name: f.name || undefined,
        categoryName: f.categoryName || undefined,
        brandName: f.brandName || undefined,
        lowStock: f.lowStock || undefined,
      };
      this.service.loadPage(params).subscribe({ error: () => undefined });
    });

    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.selectedItem.set(null));

    // Auto-refresh on tab-focus when the cached page is older than 60 s.
    useVisibilityRefresh(this.pageFetchedAt, () => this.onRefresh());
  }

  protected onColumnMenuApply(event: {
    key: string;
    filter: DataTableColumnFilterValue | null;
    sortDirection: 'asc' | 'desc' | '';
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
      code: null,
      name: null,
      categoryName: null,
      brandName: null,
      lowStock: null,
      page: 0,
    });
  }

  /**
   * Per-row decoration passed to the data-table: rings rows whose stock is at or below
   * threshold in error red so the shortage is unmissable in the grid — not just in the
   * Stock cell. Arrow function so the template reference stays stable across renders.
   */
  protected readonly lowStockRowClass = (item: Item): string =>
    this.isStockBelowThreshold(item)
      ? '!bg-[color-mix(in_srgb,var(--mat-sys-error)_12%,transparent)] !shadow-[inset_3px_0_0_0_var(--mat-sys-error)]'
      : '';

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
    this.selectedItem.set(null);
    const f = this.filterState();
    this.service
      .loadPage({
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
        code: f.code || undefined,
        name: f.name || undefined,
        categoryName: f.categoryName || undefined,
        brandName: f.brandName || undefined,
      })
      .subscribe({ error: () => undefined });
  }

  protected onShowDetail(): void {
    const item = this.selectedItem();
    if (!item) {
      return;
    }
    this.dialog.open(ItemDetailDialogComponent, {
      data: item,
      width: '560px',
      maxWidth: '95vw',
    });
  }

  protected onEdit(): void {
    const item = this.selectedItem();
    if (!item) return;
    // Carry the current URL on `history.state` so the form's Cancel / back /
    // post-save navigation can bounce us back to the exact filter slice.
    void this.router.navigate(['/items', item.code, 'editar'], {
      state: withListReturnUrl(this.router.url),
    });
  }

  protected onDelete(): void {
    const item = this.selectedItem();
    if (!item) return;
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar item',
        message: `¿Estás seguro de querer eliminar el item "${item.name}" (${item.code})?`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        destructive: true,
      },
    });
    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed !== true) return;
      // See affiliate-list.page.ts for the rationale: when the operator is
      // already on the last page, no row needs to be promoted from page N+1
      // into the freed slot, so the post-success refetch is pure flicker.
      const wasLastPage = this.service.page()?.last ?? true;
      this.service.removeFromCachedPage(item.code);
      this.service.delete(item.code).subscribe({
        next: () => {
          this.selectedItem.set(null);
          this.snackBar.open('Item eliminado', 'Cerrar');
          if (!wasLastPage) {
            this.onRefresh();
          }
        },
        error: (err: { status?: number; error?: { detail?: string } }) => {
          // Restore the optimistically-dropped row before showing the toast so
          // the operator sees the item back where it was.
          this.onRefresh();
          // Backend ships 409 with a localised `detail` message for the two
          // soft-delete guards (stock > 0 / active plan reference). Surface that
          // verbatim so the operator knows exactly what to fix — falling back
          // to a generic line for non-409 failures.
          const message =
            err.status === 409
              ? (err.error?.detail ?? 'No se puede eliminar el item en su estado actual.')
              : 'No se pudo eliminar el item';
          this.snackBar.open(message, 'Cerrar', { duration: 7000 });
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
