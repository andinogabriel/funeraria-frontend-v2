import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  DataTableComponent,
  type DataTableColumn,
  type DataTableEmptyState,
} from '../../../shared/data-table';
import { formatDate, formatDateTime } from '../../../shared/format';
import { FreshnessIndicatorComponent, useVisibilityRefresh } from '../../../shared/freshness';
import { AffiliateService } from '../affiliate.service';
import type { Affiliate } from '../affiliate.types';

/**
 * Admin-only "Papelera" surface for soft-deleted affiliates. Backed by
 * `GET /api/v1/affiliates/deleted` — the backend filters every operational
 * read on `deletedAt is null`, so this page is the single entry point to the
 * removed records.
 *
 * <h3>Read-only by design</h3>
 *
 * The page intentionally ships no restore / purge actions. Product decision:
 * the papelera is a compliance / audit surface, not a recovery one. If an
 * operator deletes an affiliate by mistake, the workflow is:
 *
 * <ol>
 *   <li>Locate the row in the papelera, copy the data needed.</li>
 *   <li>Re-create the affiliate from `/afiliados/nuevo` with a new DNI
 *       (the original is taken — see the backend product note on the
 *       unique constraint).</li>
 * </ol>
 *
 * Adding "Restaurar" is a future PR; the trade-off is the DNI collision
 * conversation we postponed.
 *
 * <h3>URL-sync of state</h3>
 *
 * Pagination (`page`, `size`) lives in the URL — back / forward / refresh /
 * shareable link restore the exact view. No filters yet: the surface is
 * meant for occasional consultation, not power-user query.
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
    RouterLink,
  ],
  templateUrl: './affiliate-bin.page.html',
  styleUrl: './affiliate-bin.page.scss',
})
export class AffiliateBinPage {
  private readonly service = inject(AffiliateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = this.service.binLoading;
  protected readonly error = this.service.binError;
  protected readonly rows = this.service.binRows;
  protected readonly totalElements = this.service.binTotalElements;
  protected readonly pageFetchedAt = this.service.binFetchedAt;

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

  /**
   * Two-state empty message: out-of-range page (operator landed on a stale
   * link past the end of the data) and truly empty papelera. Out-of-range
   * carries a CTA that resets the URL to `page=0`.
   */
  protected readonly emptyState = computed<DataTableEmptyState>(() => {
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
    },
    {
      key: 'lastName',
      label: 'Apellido',
      value: (a) => a.lastName,
      sortable: false,
    },
    {
      key: 'firstName',
      label: 'Nombre',
      value: (a) => a.firstName,
      sortable: false,
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
    },
    {
      key: 'deletedBy',
      label: 'Eliminado por',
      value: (a) => a.deletedBy,
      sortable: false,
    },
  ]);

  protected readonly trackByDni = (_: number, row: Affiliate): number => row.dni;

  constructor() {
    // URL → backend. Re-fetches the page whenever any URL param changes.
    effect(() => {
      this.service
        .loadDeletedPage({ page: this.pageIndex(), limit: this.pageSize() })
        .subscribe({ error: () => undefined });
    });

    // Auto-refresh on tab-focus when the cached page is older than 60 s.
    useVisibilityRefresh(this.pageFetchedAt, () => this.onRefresh());
  }

  protected onPageChange(event: { pageIndex: number; pageSize: number }): void {
    this.pushToUrl({ page: event.pageIndex, size: event.pageSize });
  }

  protected onRefresh(): void {
    this.service
      .loadDeletedPage({ page: this.pageIndex(), limit: this.pageSize() })
      .subscribe({ error: () => undefined });
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
