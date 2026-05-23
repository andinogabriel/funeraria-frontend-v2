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
import { formatDate } from '../../../shared/format';
import { FreshnessIndicatorComponent, useVisibilityRefresh } from '../../../shared/freshness';
import { AffiliateDetailDialogComponent } from '../components/affiliate-detail-dialog.component';
import { AffiliateService } from '../affiliate.service';
import type { Affiliate, AffiliatePageQuery } from '../affiliate.types';

/**
 * Affiliates list page. Server-side paginated against
 * `GET /api/v1/affiliates/paginated` — the table holds only the current slice and the
 * paginator's total comes from the response payload.
 *
 * <h3>Touch-first column-menu interaction</h3>
 *
 * Every filter input lives inside the per-column header menus the shared data-table
 * provides. Column types in this page:
 *
 * <ul>
 *   <li><b>DNI</b> (text) → backend `dni` (case-insensitive substring against the DNI
 *       cast to string). Sort enabled.</li>
 *   <li><b>Apellido</b> (text) → backend `lastName`. Sort enabled.</li>
 *   <li><b>Nombre</b> (text) → backend `firstName`. Sort enabled.</li>
 *   <li><b>Nacimiento</b> (dateRange) → backend `from` / `to`. Sort enabled.</li>
 *   <li><b>Parentesco</b> (autocomplete) → backend `relationshipName`. The autocomplete
 *       options are sourced from the distinct relationship names of the currently
 *       loaded rows; the operator types ≥3 letters, picks one, and the picked name is
 *       committed as the filter value. Sort intentionally disabled — sorting by a
 *       single selected relationship has no operator value.</li>
 *   <li><b>Género</b> → sort-only menu, no filter input (and hidden by default).</li>
 * </ul>
 *
 * Filter inputs are staged inside each column's menu; the user clicks "Aceptar" to
 * commit. Empty values are routed as `null` from the data-table → the page drops the
 * corresponding URL param.
 *
 * <h3>URL-sync of state</h3>
 *
 * Pagination (`page`, `size`, `sortBy`, `sortDir`) AND filters (`firstName`,
 * `lastName`, `dni`, `relationshipName`, `from`, `to`) all live in the URL. Browser
 * back / forward / refresh / shareable link restore the exact view — the page reads
 * the URL on init + every change, hydrates the data-table inputs from those signals,
 * and writes back through `router.navigate({ replaceUrl: true })`.
 *
 * <h3>Stale-while-revalidate</h3>
 *
 * The previous page's rows stay visible while a new page loads so the table never
 * flashes a skeleton mid-session. First load shows the data-table's inline skeleton.
 */
@Component({
  selector: 'app-affiliate-list-page',
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
  templateUrl: './affiliate-list.page.html',
  styleUrl: './affiliate-list.page.scss',
})
export class AffiliateListPage {
  private readonly service = inject(AffiliateService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly rows = this.service.pageRows;
  protected readonly totalElements = this.service.totalElements;
  protected readonly pageFetchedAt = this.service.pageFetchedAt;

  protected readonly selectedAffiliate = signal<Affiliate | null>(null);
  protected readonly hasSelection = computed(() => this.selectedAffiliate() !== null);

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
    const active = this.query().get('sortBy') ?? 'lastName';
    const dirParam = (this.query().get('sortDir') ?? 'asc') as 'asc' | 'desc';
    return { active, direction: dirParam };
  });

  /** Filter values parsed from the URL — feed into the backend call and the data-table. */
  protected readonly filterState = computed(() => ({
    firstName: this.query().get('firstName') ?? '',
    lastName: this.query().get('lastName') ?? '',
    dni: this.query().get('dni') ?? '',
    relationshipName: this.query().get('relationshipName') ?? '',
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
      if (f.firstName.length > 0) {
        map.set('firstName', { type: 'text', value: f.firstName });
      }
      if (f.lastName.length > 0) {
        map.set('lastName', { type: 'text', value: f.lastName });
      }
      if (f.dni.length > 0) {
        map.set('dni', { type: 'text', value: f.dni });
      }
      if (f.relationshipName.length > 0) {
        map.set('relationship', {
          type: 'autocomplete',
          value: f.relationshipName,
          label: f.relationshipName,
        });
      }
      if (f.from !== null || f.to !== null) {
        map.set('birthDate', { type: 'dateRange', from: f.from, to: f.to });
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
      f.relationshipName.length > 0 ||
      f.from !== null ||
      f.to !== null
    );
  });

  /**
   * Three-state empty message: filtered (no matches), out-of-range page, or
   * truly empty padrón. Out-of-range gets a CTA that resets the URL to
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
      icon: 'group',
      title: 'No hay afiliados activos',
      body: 'Sumá uno desde «Nuevo afiliado» arriba a la derecha.',
    };
  });

  /**
   * Distinct relationship names derived from the currently loaded page's rows. The
   * autocomplete suggestion list mirrors what the table actually contains. This is a
   * pragmatic trade-off: the operator only sees relationships present in the current
   * slice, but those are the only filter values that would actually match.
   */
  private readonly relationshipOptions = (): readonly DataTableAutocompleteOption[] => {
    const distinct = new Set<string>();
    for (const affiliate of this.rows()) {
      if (affiliate.relationship?.name) {
        distinct.add(affiliate.relationship.name);
      }
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name }));
  };

  /**
   * Template ref for the Nacimiento cell. The `value` accessor keeps the ISO
   * date so the grid sort is chronological; the template runs `formatDate`
   * so the operator sees `dd/MM/yyyy` instead of the raw `1990-10-09`.
   */
  private readonly birthDateCell =
    viewChild<TemplateRef<{ $implicit: Affiliate }>>('birthDateCell');

  protected readonly columns = computed<readonly DataTableColumn<Affiliate>[]>(() => [
    {
      key: 'dni',
      label: 'DNI',
      value: (a) => a.dni,
      cellClass: 'font-mono tabular-nums',
      hideable: false,
      filter: 'text',
    },
    {
      key: 'lastName',
      label: 'Apellido',
      value: (a) => a.lastName,
      filter: 'text',
    },
    {
      key: 'firstName',
      label: 'Nombre',
      value: (a) => a.firstName,
      filter: 'text',
    },
    {
      key: 'birthDate',
      label: 'Nacimiento',
      value: (a) => a.birthDate,
      cellTemplate: this.birthDateCell(),
      cellClass: 'tabular-nums',
      filter: 'dateRange',
    },
    {
      key: 'relationship',
      label: 'Parentesco',
      value: (a) => a.relationship.name,
      filter: 'autocomplete',
      // Sorting by a single selected relationship carries no operator meaning, so the
      // column-menu shows only the autocomplete + Aceptar — no sort radios.
      sortable: false,
      autocomplete: {
        options: this.relationshipOptions,
        placeholder: 'Buscar parentesco',
      },
    },
    {
      key: 'gender',
      label: 'Género',
      value: (a) => a.gender.name,
      defaultVisible: false,
    },
  ]);

  protected readonly trackByDni = (_: number, row: Affiliate): number => row.dni;

  /** Bound to the cellTemplate so the template can call the canonical formatter. */
  protected readonly formatDate = formatDate;

  constructor() {
    // URL → backend. Re-fetches the page whenever any URL param changes.
    effect(() => {
      const f = this.filterState();
      const params: AffiliatePageQuery = {
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
        firstName: f.firstName || undefined,
        lastName: f.lastName || undefined,
        dni: f.dni || undefined,
        relationshipName: f.relationshipName || undefined,
        from: f.from ?? undefined,
        to: f.to ?? undefined,
      };
      this.service.loadPage(params).subscribe({ error: () => undefined });
    });

    // Clear the selection on every URL change so action buttons that depend on it
    // reflect reality.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.selectedAffiliate.set(null));

    // Auto-refresh on tab-focus when the cached page is older than 60 s, so two
    // operators looking at the same padrón don't silently diverge after one of
    // them stepped away.
    useVisibilityRefresh(this.pageFetchedAt, () => this.onRefresh());
  }

  /**
   * Single-call handler for the data-table's column-menu Aceptar. Carries both filter
   * and sort changes in one atomic patch so the router writes them in a single
   * `navigate()` call — mirrors the incomes-list approach.
   */
  protected onColumnMenuApply(event: {
    key: string;
    filter: DataTableColumnFilterValue | null;
    sortDirection: 'asc' | 'desc' | '';
  }): void {
    const patch: Record<string, string | number | null> = { page: 0 };

    if (event.key === 'firstName') {
      patch['firstName'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'lastName') {
      patch['lastName'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'dni') {
      patch['dni'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'relationship') {
      patch['relationshipName'] = event.filter?.type === 'autocomplete' ? event.filter.value : null;
    } else if (event.key === 'birthDate') {
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
   * Sort change emitted by sort-only columns (no filter declared). They commit via click
   * on the menu items, not via the Aceptar button, so they ride this event channel
   * instead of `(columnMenuApply)`.
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
    this.pushToUrl({
      firstName: null,
      lastName: null,
      dni: null,
      relationshipName: null,
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
    this.selectedAffiliate.set(null);
    const f = this.filterState();
    this.service
      .loadPage({
        page: this.pageIndex(),
        limit: this.pageSize(),
        sortBy: this.sortState().active,
        sortDir: this.sortState().direction === 'asc' ? 'asc' : 'desc',
        firstName: f.firstName || undefined,
        lastName: f.lastName || undefined,
        dni: f.dni || undefined,
        relationshipName: f.relationshipName || undefined,
        from: f.from ?? undefined,
        to: f.to ?? undefined,
      })
      .subscribe({ error: () => undefined });
  }

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

  protected onEdit(): void {
    const affiliate = this.selectedAffiliate();
    if (!affiliate) {
      return;
    }
    void this.router.navigate(['/afiliados', affiliate.dni, 'editar']);
  }

  protected onDelete(): void {
    const affiliate = this.selectedAffiliate();
    if (!affiliate) {
      return;
    }
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar afiliado',
        message: `¿Estás seguro de querer eliminar a ${affiliate.firstName} ${affiliate.lastName} (DNI ${affiliate.dni})?`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        destructive: true,
      },
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed !== true) {
        return;
      }
      // Snapshot the page envelope BEFORE the optimistic mutation so we can
      // decide whether the post-success refetch is worth a round-trip. When the
      // operator was already on the last page, deleting a row does not create a
      // hole that needs to be filled from a non-existent page N+1 — the cache
      // mutation alone is the canonical state. Skipping the fetch avoids the
      // visible loading flash that followed every delete.
      const wasLastPage = this.service.page()?.last ?? true;
      this.service.removeFromCachedPage(affiliate.dni);

      this.service.delete(affiliate.dni).subscribe({
        next: () => {
          this.selectedAffiliate.set(null);
          this.snackBar.open('Afiliado eliminado', 'Cerrar');
          if (!wasLastPage) {
            this.onRefresh();
          }
        },
        error: () => {
          this.onRefresh();
          this.snackBar.open('No se pudo eliminar el afiliado', 'Cerrar');
        },
      });
    });
  }
}
