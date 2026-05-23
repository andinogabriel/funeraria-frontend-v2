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
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';

import {
  DataTableComponent,
  type DataTableAutocompleteOption,
  type DataTableColumn,
  type DataTableColumnFilterValue,
  type DataTableEmptyState,
} from '../../../shared/data-table';
import { formatDateTime } from '../../../shared/format';
import { FreshnessIndicatorComponent, useVisibilityRefresh } from '../../../shared/freshness';
import { AuditService } from '../audit.service';
import type { AuditAction, AuditEvent, AuditEventFilter } from '../audit.types';
import { AuditEventDetailDialogComponent } from '../components/audit-event-detail-dialog.component';

/**
 * Lists audit events with server-side pagination and per-column filters.
 *
 * <h3>Why this view diverges from the in-page filter form it replaced</h3>
 *
 * Auditoría is a high-volume read endpoint — registers grow unbounded — so:
 * <ul>
 *   <li>Every interaction (filter, page change, refresh) is a backend round-trip.</li>
 *   <li>Filters live inside the per-column header menus the shared data-table
 *       provides (text / autocomplete / dateRange), exactly like {@code
 *       /afiliados}, {@code /servicios} and {@code /ingresos}. This keeps the
 *       grid surface homogeneous across the app — the operator does not have to
 *       learn a new filter idiom per screen.</li>
 *   <li>Sort is fixed on the backend by contract (most-recent first), so every
 *       column declares {@code sortable: false}. The column menu shows only the
 *       filter input + Aceptar — no sort radios.</li>
 * </ul>
 *
 * <h3>Per-column filter map</h3>
 *
 * <ul>
 *   <li><b>Fecha</b> ({@code occurredAt}) → {@code dateRange} → backend
 *       {@code from} / {@code to}. The data-table emits ISO date strings
 *       ({@code yyyy-MM-dd}); we convert each end to an instant anchored to
 *       Argentina local time (00:00 / 23:59:59.999) before hitting the
 *       endpoint, which parses {@code OffsetDateTime}.</li>
 *   <li><b>Actor</b> ({@code actorEmail}) → {@code text} → backend
 *       {@code actorEmail}.</li>
 *   <li><b>Acción</b> ({@code action}) → {@code autocomplete} sourced from the
 *       closed catalog of {@link AuditAction} values. The picked code is
 *       committed as the filter value.</li>
 *   <li><b>Objetivo</b> ({@code targetType}) → {@code text} → backend
 *       {@code targetType}.</li>
 *   <li><b>ID</b> ({@code targetId}) → {@code text} → backend
 *       {@code targetId}.</li>
 *   <li>{@code traceId} / {@code correlationId} carry no filter (hidden by
 *       default; only useful when tracing a specific request).</li>
 * </ul>
 *
 * <h3>URL-sync of state</h3>
 *
 * Pagination ({@code page}, {@code size}) AND filters ({@code actorEmail},
 * {@code action}, {@code targetType}, {@code targetId}, {@code from},
 * {@code to}) all live in the URL. Browser back / forward / refresh /
 * shareable link restore the exact view. The page reads the URL on init + on
 * every change, hydrates the data-table inputs from those signals, and writes
 * back through {@code router.navigate({ replaceUrl: true })}.
 */
@Component({
  selector: 'app-audit-event-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataTableComponent,
    FreshnessIndicatorComponent,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './audit-event-list.page.html',
  styleUrl: './audit-event-list.page.scss',
})
export class AuditEventListPage {
  private readonly service = inject(AuditService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly pageFetchedAt = this.service.pageFetchedAt;

  protected readonly events = computed<readonly AuditEvent[]>(
    () => this.service.page()?.content ?? [],
  );
  protected readonly totalElements = computed<number>(
    () => this.service.page()?.totalElements ?? 0,
  );

  protected readonly selectedEvent = signal<AuditEvent | null>(null);
  protected readonly hasSelection = computed(() => this.selectedEvent() !== null);

  /** Closed catalog of actions surfaced in the Acción autocomplete. */
  private static readonly ACTION_OPTIONS: readonly AuditAction[] = [
    'USER_ROLE_GRANTED',
    'USER_ROLE_REVOKED',
    'USER_ACTIVATED',
    'AFFILIATE_CREATED',
    'AFFILIATE_DELETED',
    'FUNERAL_CREATED',
    'FUNERAL_DELETED',
    'FUNERAL_STATE_CHANGED',
  ] as const;

  private readonly actionOptions = (): readonly DataTableAutocompleteOption[] =>
    AuditEventListPage.ACTION_OPTIONS.map((value) => ({ value, label: value }));

  /** Template ref for the Fecha cell — formats the ISO instant in AR-local time. */
  private readonly occurredAtCell =
    viewChild<TemplateRef<{ $implicit: AuditEvent }>>('occurredAtCell');

  /** Bound to the cellTemplate so the template can call the canonical formatter. */
  protected readonly formatDateTime = formatDateTime;

  /** Reactive snapshot of the URL query params — drives the backend call. */
  private readonly query = this.route.queryParamMap;

  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(10);

  protected readonly filterState = signal({
    actorEmail: '',
    action: '' as AuditAction | '',
    targetType: '',
    targetId: '',
    from: null as string | null,
    to: null as string | null,
  });

  /** Per-column filter map passed into the data-table. */
  protected readonly columnFilters = computed<ReadonlyMap<string, DataTableColumnFilterValue>>(
    () => {
      const f = this.filterState();
      const map = new Map<string, DataTableColumnFilterValue>();
      if (f.actorEmail.length > 0) {
        map.set('actorEmail', { type: 'text', value: f.actorEmail });
      }
      if (f.action.length > 0) {
        map.set('action', { type: 'autocomplete', value: f.action, label: f.action });
      }
      if (f.targetType.length > 0) {
        map.set('targetType', { type: 'text', value: f.targetType });
      }
      if (f.targetId.length > 0) {
        map.set('targetId', { type: 'text', value: f.targetId });
      }
      if (f.from !== null || f.to !== null) {
        map.set('occurredAt', { type: 'dateRange', from: f.from, to: f.to });
      }
      return map;
    },
  );

  protected readonly hasActiveFilters = computed(() => {
    const f = this.filterState();
    return (
      f.actorEmail.length > 0 ||
      f.action.length > 0 ||
      f.targetType.length > 0 ||
      f.targetId.length > 0 ||
      f.from !== null ||
      f.to !== null
    );
  });

  /**
   * Three-state empty message: filtered (no matches), out-of-range page, or
   * truly empty audit trail.
   */
  protected readonly emptyState = computed<DataTableEmptyState>(() => {
    if (this.hasActiveFilters()) {
      return {
        icon: 'filter_alt_off',
        title: 'Sin resultados',
        body: 'Probá con otro criterio o ampliá el rango de fechas.',
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
      icon: 'policy',
      title: 'No hay eventos registrados',
      body: 'Cuando se ejecute una operación sensible aparecerá aquí.',
    };
  });

  protected readonly columns = computed<readonly DataTableColumn<AuditEvent>[]>(() => [
    {
      key: 'occurredAt',
      label: 'Fecha',
      // `value` keeps the raw ISO so the cell sort stays chronological even
      // though the column is non-sortable from the UI.
      value: (e) => e.occurredAt,
      cellTemplate: this.occurredAtCell(),
      cellClass: 'tabular-nums whitespace-nowrap',
      sortable: false,
      hideable: false,
      filter: 'dateRange',
    },
    {
      key: 'actorEmail',
      label: 'Actor',
      value: (e) => e.actorEmail,
      sortable: false,
      filter: 'text',
    },
    {
      key: 'action',
      label: 'Acción',
      value: (e) => e.action,
      sortable: false,
      filter: 'autocomplete',
      autocomplete: {
        options: this.actionOptions,
        placeholder: 'Buscar acción',
      },
    },
    {
      key: 'targetType',
      label: 'Objetivo',
      value: (e) => e.targetType,
      sortable: false,
      filter: 'text',
    },
    {
      key: 'targetId',
      label: 'ID',
      value: (e) => e.targetId,
      cellClass: 'font-mono tabular-nums',
      sortable: false,
      filter: 'text',
    },
    {
      key: 'traceId',
      label: 'Trace',
      value: (e) => e.traceId ?? '',
      cellClass: 'font-mono text-xs',
      sortable: false,
      defaultVisible: false,
    },
    {
      key: 'correlationId',
      label: 'Correlation',
      value: (e) => e.correlationId ?? '',
      cellClass: 'font-mono text-xs',
      sortable: false,
      defaultVisible: false,
    },
  ]);

  protected readonly trackById = (_: number, row: AuditEvent): number => row.id;

  constructor() {
    // URL → page state. Re-hydrates the local signals whenever the URL changes.
    this.query.pipe(takeUntilDestroyed()).subscribe((params) => {
      const rawPage = params.get('page');
      const parsedPage = rawPage === null ? 0 : Number.parseInt(rawPage, 10);
      this.pageIndex.set(Number.isFinite(parsedPage) && parsedPage >= 0 ? parsedPage : 0);

      const rawSize = params.get('size');
      const parsedSize = rawSize === null ? 10 : Number.parseInt(rawSize, 10);
      this.pageSize.set(Number.isFinite(parsedSize) && parsedSize > 0 ? parsedSize : 10);

      const rawAction = params.get('action') ?? '';
      this.filterState.set({
        actorEmail: params.get('actorEmail') ?? '',
        action: AuditEventListPage.ACTION_OPTIONS.includes(rawAction as AuditAction)
          ? (rawAction as AuditAction)
          : '',
        targetType: params.get('targetType') ?? '',
        targetId: params.get('targetId') ?? '',
        from: params.get('from'),
        to: params.get('to'),
      });

      // Selection no longer reflects the slice we're about to fetch.
      this.selectedEvent.set(null);
    });

    // State → backend. Re-fetches on every URL-driven state change.
    effect(() => {
      this.service
        .search(this.buildFilter(), { page: this.pageIndex(), size: this.pageSize() })
        .subscribe({ error: () => undefined });
    });

    // Auto-refresh on tab-focus when the cached page is older than 60 s — audit
    // is the surface where divergence between two operators hurts most.
    useVisibilityRefresh(this.pageFetchedAt, () => this.onRefresh());
  }

  /**
   * Single-call handler for the data-table's column-menu Aceptar. Carries the
   * filter change in one atomic patch so the router writes it in a single
   * navigate() call. Sort is fixed by contract, so the sortDirection portion of
   * the event is ignored.
   */
  protected onColumnMenuApply(event: {
    key: string;
    filter: DataTableColumnFilterValue | null;
  }): void {
    const patch: Record<string, string | number | null> = { page: 0 };

    if (event.key === 'actorEmail') {
      patch['actorEmail'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'targetType') {
      patch['targetType'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'targetId') {
      patch['targetId'] = event.filter?.type === 'text' ? event.filter.value : null;
    } else if (event.key === 'action') {
      patch['action'] = event.filter?.type === 'autocomplete' ? event.filter.value : null;
    } else if (event.key === 'occurredAt') {
      if (event.filter?.type === 'dateRange') {
        patch['from'] = event.filter.from;
        patch['to'] = event.filter.to;
      } else {
        patch['from'] = null;
        patch['to'] = null;
      }
    }

    this.pushToUrl(patch);
  }

  protected onPageChange(event: { pageIndex: number; pageSize: number }): void {
    this.pushToUrl({ page: event.pageIndex, size: event.pageSize });
  }

  protected onClearFilters(): void {
    this.pushToUrl({
      actorEmail: null,
      action: null,
      targetType: null,
      targetId: null,
      from: null,
      to: null,
      page: 0,
    });
  }

  protected onRefresh(): void {
    this.selectedEvent.set(null);
    this.service
      .search(this.buildFilter(), { page: this.pageIndex(), size: this.pageSize() })
      .subscribe({ error: () => undefined });
  }

  protected onShowDetail(): void {
    const selected = this.selectedEvent();
    if (!selected) {
      return;
    }
    this.dialog.open(AuditEventDetailDialogComponent, {
      data: selected,
      width: '560px',
      maxWidth: '95vw',
    });
  }

  /**
   * Builds the backend filter payload from the URL-driven state. ISO date
   * strings ({@code yyyy-MM-dd}) are anchored to Argentina local time
   * (00:00 for {@code from}, 23:59:59.999 for {@code to}) before being
   * serialised as UTC instants for the {@code OffsetDateTime.parse} on the
   * backend.
   */
  private buildFilter(): AuditEventFilter {
    const f = this.filterState();
    return {
      actorEmail: f.actorEmail.trim() || undefined,
      action: f.action || undefined,
      targetType: f.targetType.trim() || undefined,
      targetId: f.targetId.trim() || undefined,
      from: f.from ? argDateToInstant(f.from, 'start') : undefined,
      to: f.to ? argDateToInstant(f.to, 'end') : undefined,
    };
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
 * backend can parse it with {@code OffsetDateTime.parse}.
 *
 * Argentina is UTC-3 with no DST, so the offset is a constant — no need to go
 * through {@code Intl} machinery for this single conversion.
 */
function argDateToInstant(isoDate: string, bound: 'start' | 'end'): string {
  const time = bound === 'start' ? '00:00:00.000' : '23:59:59.999';
  return new Date(`${isoDate}T${time}-03:00`).toISOString();
}
