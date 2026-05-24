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
  type DataTableAutocompleteOption,
  type DataTableColumn,
  type DataTableColumnFilterValue,
  type DataTableEmptyState,
} from '../../../shared/data-table';
import { formatDate, formatDateTime } from '../../../shared/format';
import { FreshnessIndicatorComponent, useVisibilityRefresh } from '../../../shared/freshness';
import { AffiliateDetailDialogComponent } from '../components/affiliate-detail-dialog.component';
import { AffiliateService } from '../affiliate.service';
import type { Affiliate, AffiliateBinPageQuery } from '../affiliate.types';

/**
 * Admin-only "Papelera" surface for soft-deleted affiliates. Backed by
 * `GET /api/v1/affiliates/deleted` — the backend filters every operational
 * read on `deletedAt is null`, so this page is the single entry point to the
 * removed records.
 *
 * <h3>Per-column filters</h3>
 *
 * Mirrors the active-listing UX so the operator does not have to learn a
 * different filter idiom for the bin:
 *
 * <ul>
 *   <li><b>DNI</b> (text) → backend `dni` (case-insensitive substring).</li>
 *   <li><b>Apellido</b> (text) → backend `lastName`.</li>
 *   <li><b>Nombre</b> (text) → backend `firstName`.</li>
 *   <li><b>Eliminado</b> (dateRange) → backend `deletedFrom` / `deletedTo`.
 *       The data-table emits ISO date strings (`yyyy-MM-dd`); we convert each
 *       end to an instant anchored to Argentina local time (00:00 / 23:59:59.999)
 *       before hitting the endpoint, same shape used by the audit-events search.</li>
 *   <li><b>Eliminado por</b> (autocomplete) → backend `deletedBy`. The
 *       suggestion list is sourced from the distinct admin emails of the
 *       currently loaded slice. The picked value is committed as a precise
 *       substring filter.</li>
 * </ul>
 *
 * <h3>Detalle</h3>
 *
 * Selecting a row enables a "Detalle" icon button at the top of the card.
 * The action opens the shared {@link AffiliateDetailDialogComponent} which
 * shows the full affiliate record plus the tombstone fields (Eliminado /
 * Eliminado por) when the dialog is opened from this surface.
 *
 * <h3>Read-only by design</h3>
 *
 * No restore / purge actions — the papelera is a compliance / audit surface,
 * not a recovery one. Re-creating a deleted record goes through the regular
 * `/afiliados/nuevo` flow (the original DNI stays taken; product decision).
 *
 * <h3>URL-sync of state</h3>
 *
 * Pagination + filters live in the URL. Browser back / forward / refresh /
 * shareable link restore the exact view.
 */
@Component({
  selector: 'app-affiliate-bin-page',
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
  templateUrl: './affiliate-bin.page.html',
  styleUrl: './affiliate-bin.page.scss',
})
export class AffiliateBinPage {
  private readonly service = inject(AffiliateService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = this.service.binLoading;
  protected readonly error = this.service.binError;
  protected readonly rows = this.service.binRows;
  protected readonly totalElements = this.service.binTotalElements;
  protected readonly pageFetchedAt = this.service.binFetchedAt;

  protected readonly selectedAffiliate = signal<Affiliate | null>(null);
  protected readonly hasSelection = computed(() => this.selectedAffiliate() !== null);

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

  /** Filter values parsed from the URL — feed both the backend call and the data-table. */
  protected readonly filterState = computed(() => ({
    firstName: this.query().get('firstName') ?? '',
    lastName: this.query().get('lastName') ?? '',
    dni: this.query().get('dni') ?? '',
    deletedBy: this.query().get('deletedBy') ?? '',
    deletedFrom: this.query().get('deletedFrom') ?? null,
    deletedTo: this.query().get('deletedTo') ?? null,
  }));

  /** Per-column filter map fed back into the data-table for chip restoration. */
  protected readonly columnFilters = computed<ReadonlyMap<string, DataTableColumnFilterValue>>(
    () => {
      const f = this.filterState();
      const map = new Map<string, DataTableColumnFilterValue>();
      if (f.firstName.length > 0) {
        map.set('firstName', { type: 'text', value: f.firstName });
      }
      if (f.lastName.length > 0) {
        map.set('lastName', { type: 'text', value: f.lastName });
      }
      if (f.dni.length > 0) {
        map.set('dni', { type: 'text', value: f.dni });
      }
      if (f.deletedBy.length > 0) {
        map.set('deletedBy', {
          type: 'autocomplete',
          value: f.deletedBy,
          label: f.deletedBy,
        });
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
      f.firstName.length > 0 ||
      f.lastName.length > 0 ||
      f.dni.length > 0 ||
      f.deletedBy.length > 0 ||
      f.deletedFrom !== null ||
      f.deletedTo !== null
    );
  });

  /**
   * Distinct deletedBy emails derived from the currently loaded slice. Mirrors the
   * `relationshipOptions` source on the active listing — the operator can only filter
   * by admins that appear on the current page, but those are the only values that
   * would actually narrow anything.
   */
  private readonly deletedByOptions = (): readonly DataTableAutocompleteOption[] => {
    const distinct = new Set<string>();
    for (const affiliate of this.rows()) {
      if (affiliate.deletedBy) {
        distinct.add(affiliate.deletedBy);
      }
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((email) => ({ value: email, label: email }));
  };

  /**
   * Three-state empty message: filtered (no matches), out-of-range page
   * (operator landed on a stale link past the end of the data), or truly
   * empty papelera.
   */
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
      body: 'No hay afiliados eliminados.',
    };
  });

  /**
   * Template ref for the Eliminado cell — formats the ISO instant in AR-local
   * time. Mirrors the {@code Nacimiento} cell pattern used by the active
   * listing.
   */
  private readonly deletedAtCell =
    viewChild<TemplateRef<{ $implicit: Affiliate }>>('deletedAtCell');

  /** Bound to the cellTemplate so the template can call the canonical formatter. */
  protected readonly formatDateTime = formatDateTime;

  protected readonly columns = computed<readonly DataTableColumn<Affiliate>[]>(() => [
    {
      key: 'dni',
      label: 'DNI',
      value: (a) => a.dni,
      cellClass: 'font-mono tabular-nums',
      hideable: false,
      sortable: false,
      filter: 'text',
    },
    {
      key: 'lastName',
      label: 'Apellido',
      value: (a) => a.lastName,
      sortable: false,
      filter: 'text',
    },
    {
      key: 'firstName',
      label: 'Nombre',
      value: (a) => a.firstName,
      sortable: false,
      filter: 'text',
    },
    {
      key: 'birthDate',
      label: 'Nacimiento',
      value: (a) => formatDate(a.birthDate),
      cellClass: 'tabular-nums',
      sortable: false,
    },
    {
      key: 'deletedAt',
      label: 'Eliminado',
      // Sort intentionally off — the backend ships rows ordered most-recent-deleted
      // first by contract; toggling the header would mislead the operator.
      value: (a) => a.deletedAt,
      cellTemplate: this.deletedAtCell(),
      cellClass: 'tabular-nums whitespace-nowrap',
      sortable: false,
      hideable: false,
      filter: 'dateRange',
    },
    {
      key: 'deletedBy',
      label: 'Eliminado por',
      value: (a) => a.deletedBy,
      sortable: false,
      filter: 'autocomplete',
      autocomplete: {
        options: this.deletedByOptions,
        placeholder: 'Buscar email',
      },
    },
  ]);

  protected readonly trackByDni = (_: number, row: Affiliate): number => row.dni;

  constructor() {
    // URL → backend. Re-fetches the page whenever any URL param changes.
    effect(() => {
      const f = this.filterState();
      const params: AffiliateBinPageQuery = {
        page: this.pageIndex(),
        limit: this.pageSize(),
        firstName: f.firstName || undefined,
        lastName: f.lastName || undefined,
        dni: f.dni || undefined,
        deletedBy: f.deletedBy || undefined,
        deletedFrom: f.deletedFrom ? argDateToInstant(f.deletedFrom, 'start') : undefined,
        deletedTo: f.deletedTo ? argDateToInstant(f.deletedTo, 'end') : undefined,
      };
      this.service.loadDeletedPage(params).subscribe({ error: () => undefined });
    });

    // Clear the selection on every URL change so the action button that depends
    // on it reflects the visible slice.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.selectedAffiliate.set(null));

    // Auto-refresh on tab-focus when the cached page is older than 60 s.
    useVisibilityRefresh(this.pageFetchedAt, () => this.onRefresh());
  }

  /**
   * Single-call handler for the data-table's column-menu Aceptar. Mirrors the
   * active-listing pattern: filter changes reset to page 0 in one atomic
   * patch.
   */
  protected onColumnMenuApply(event: {
    key: string;
    filter: DataTableColumnFilterValue | null;
  }): void {
    const patch: Record<string, string | number | null> = { page: 0 };

    if (event.key === 'firstName') {
      patch['firstName'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'lastName') {
      patch['lastName'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'dni') {
      patch['dni'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'deletedBy') {
      patch['deletedBy'] = event.filter?.type === 'autocomplete' ? event.filter.value : null;
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
      firstName: null,
      lastName: null,
      dni: null,
      deletedBy: null,
      deletedFrom: null,
      deletedTo: null,
      page: 0,
    });
  }

  protected onRefresh(): void {
    this.selectedAffiliate.set(null);
    const f = this.filterState();
    this.service
      .loadDeletedPage({
        page: this.pageIndex(),
        limit: this.pageSize(),
        firstName: f.firstName || undefined,
        lastName: f.lastName || undefined,
        dni: f.dni || undefined,
        deletedBy: f.deletedBy || undefined,
        deletedFrom: f.deletedFrom ? argDateToInstant(f.deletedFrom, 'start') : undefined,
        deletedTo: f.deletedTo ? argDateToInstant(f.deletedTo, 'end') : undefined,
      })
      .subscribe({ error: () => undefined });
  }

  /** Opens the shared affiliate detail dialog for the currently-selected row. */
  protected onShowDetail(): void {
    const affiliate = this.selectedAffiliate();
    if (!affiliate) {
      return;
    }
    this.dialog.open(AffiliateDetailDialogComponent, {
      data: affiliate,
      width: '480px',
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
 * anchored to Argentina local time. {@code 'start'} returns 00:00:00.000;
 * {@code 'end'} returns 23:59:59.999. The instant is serialised as UTC so the
 * backend can compare it against the {@code deletedAt} column directly.
 *
 * Argentina is UTC-3 with no DST, so the offset is a constant — no need to go
 * through {@code Intl} machinery for this single conversion.
 */
function argDateToInstant(isoDate: string, bound: 'start' | 'end'): string {
  const time = bound === 'start' ? '00:00:00.000' : '23:59:59.999';
  return new Date(`${isoDate}T${time}-03:00`).toISOString();
}
