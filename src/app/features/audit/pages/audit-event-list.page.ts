import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { debounceTime } from 'rxjs/operators';

import { DataTableComponent, type DataTableColumn } from '../../../shared/data-table';
import { AuditService } from '../audit.service';
import type { AuditAction, AuditEvent, AuditEventFilter } from '../audit.types';
import { AuditEventDetailDialogComponent } from '../components/audit-event-detail-dialog.component';

/**
 * Lists audit events with server-side pagination and filtering.
 *
 * <h3>Server-side flow</h3>
 *
 * The page owns the filter and pagination state and re-fetches from the
 * backend on every change. `DataTableComponent` runs in `serverSide=true`
 * mode so:
 * - The current page's `AuditEvent[]` is the only data the table sees.
 * - The table does NOT sort locally — the backend exposes a fixed sort
 *   (most-recent-first) by contract so all sort headers are disabled.
 * - The paginator's total is `totalElements` from the server response.
 * - Page navigation emits `(pageChange)` and the page handler issues a
 *   new search at the new offset.
 *
 * Filter changes reset the page index to 0 (a moved filter means the
 * results the user was paginating through are no longer relevant) and
 * are debounced so typing in a text filter does not flood the backend.
 *
 * <h3>Why no `loadActive`-style boot</h3>
 *
 * Unlike affiliates, the audit dataset is unbounded; we never load "all"
 * events into memory. Every consumer interaction (filter, page change,
 * refresh) is an HTTP round-trip. The {@link AuditService#page} signal
 * is overwritten on each successful response, so the UI reads from a
 * single canonical source.
 */
@Component({
  selector: 'app-audit-event-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataTableComponent,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    ReactiveFormsModule,
  ],
  templateUrl: './audit-event-list.page.html',
  styleUrl: './audit-event-list.page.scss',
})
export class AuditEventListPage {
  private readonly service = inject(AuditService);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  /**
   * Filter form. Text inputs share a single debounce window so a fast typist
   * does not fire several requests in a row, while selects + date pickers
   * commit immediately because their interactions are inherently discrete.
   */
  protected readonly filters = this.fb.group({
    actorEmail: this.fb.control(''),
    action: this.fb.control<AuditAction | ''>(''),
    targetType: this.fb.control(''),
    targetId: this.fb.control(''),
    from: this.fb.control<Date | null>(null),
    to: this.fb.control<Date | null>(null),
  });

  /** Closed catalog of actions exposed in the filter select. */
  protected readonly actionOptions: readonly AuditAction[] = [
    'USER_ROLE_GRANTED',
    'USER_ROLE_REVOKED',
    'USER_ACTIVATED',
    'AFFILIATE_CREATED',
    'AFFILIATE_DELETED',
    'FUNERAL_CREATED',
    'FUNERAL_DELETED',
    'FUNERAL_STATE_CHANGED',
  ] as const;

  /** Current page state (0-based, in line with `PageRequest`). */
  protected readonly pageIndex = signal(0);
  protected readonly pageSize = signal(25);

  /**
   * Current page of events derived from the service signal. `null` before the
   * first call resolves; the template handles that with a loading branch.
   */
  protected readonly events = computed<readonly AuditEvent[]>(
    () => this.service.page()?.content ?? [],
  );

  /** Total elements across all pages — what the paginator needs in server-side mode. */
  protected readonly totalElements = computed<number>(
    () => this.service.page()?.totalElements ?? 0,
  );

  /** Currently selected row, two-way bound with the data-table. */
  protected readonly selectedEvent = signal<AuditEvent | null>(null);

  protected readonly hasSelection = computed(() => this.selectedEvent() !== null);

  /** Column descriptors. Sort is disabled (`sortable: false`) on every column because
   * the backend exposes a fixed sort by contract — exposing toggleable headers would
   * mislead the user into thinking they can re-order the page.
   */
  protected readonly columns: readonly DataTableColumn<AuditEvent>[] = [
    {
      key: 'occurredAt',
      label: 'Fecha',
      value: (e) => formatInstant(e.occurredAt),
      cellClass: 'tabular-nums whitespace-nowrap',
      sortable: false,
      hideable: false,
    },
    {
      key: 'actorEmail',
      label: 'Actor',
      value: (e) => e.actorEmail,
      sortable: false,
    },
    {
      key: 'action',
      label: 'Acción',
      value: (e) => e.action,
      sortable: false,
    },
    {
      key: 'targetType',
      label: 'Objetivo',
      value: (e) => e.targetType,
      sortable: false,
    },
    {
      key: 'targetId',
      label: 'ID',
      value: (e) => e.targetId,
      cellClass: 'font-mono tabular-nums',
      sortable: false,
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
  ] as const;

  protected readonly trackById = (_: number, row: AuditEvent): number => row.id;

  constructor() {
    // Fire one fetch on mount so the table is populated.
    this.fetch();

    // Re-fetch whenever filters change. Text inputs go through a debounce to keep
    // the keystrokes-per-request ratio sensible. Page index resets to 0 because the
    // results the user was paginating through are no longer relevant.
    this.filters.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe(() => {
      this.pageIndex.set(0);
      this.selectedEvent.set(null);
      this.fetch();
    });
  }

  /** Handles `(pageChange)` from the data-table; issues a fresh fetch at the new offset. */
  protected onPageChange(event: { pageIndex: number; pageSize: number }): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
    this.selectedEvent.set(null);
    this.fetch();
  }

  /** Opens the read-only detail modal for the currently-selected event. */
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

  /** Manual refresh button: clears the selection and re-runs the current search. */
  protected onRefresh(): void {
    this.selectedEvent.set(null);
    this.fetch();
  }

  /** Clears every filter back to its initial empty state. */
  protected onResetFilters(): void {
    this.filters.reset({
      actorEmail: '',
      action: '',
      targetType: '',
      targetId: '',
      from: null,
      to: null,
    });
  }

  /**
   * Translates the form value into the backend's filter contract. Empty strings
   * and `null` dates are omitted so the helper drops them from the query string;
   * dates use ISO-8601 instants so `OffsetDateTime.parse` accepts them as-is.
   */
  private buildFilter(): AuditEventFilter {
    const value = this.filters.getRawValue();
    return {
      actorEmail: value.actorEmail.trim() || undefined,
      action: value.action || undefined,
      targetType: value.targetType.trim() || undefined,
      targetId: value.targetId.trim() || undefined,
      from: value.from ? dateAsInstant(value.from, 'start') : undefined,
      to: value.to ? dateAsInstant(value.to, 'end') : undefined,
    };
  }

  private fetch(): void {
    this.service
      .search(this.buildFilter(), { page: this.pageIndex(), size: this.pageSize() })
      .subscribe();
  }
}

/**
 * Renders an ISO-8601 instant as `dd/MM/yyyy HH:mm` for table cells. Falls
 * back to the raw value when the string is unparseable so the operator still
 * sees something instead of a blank cell.
 */
function formatInstant(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * Converts a `Date` picked from the Material datepicker into an ISO-8601 instant.
 * `start` anchors the day at 00:00 local; `end` anchors at 23:59:59.999 local.
 * The instant is then serialised as UTC (`toISOString`), which the backend
 * parses via `OffsetDateTime.parse`.
 */
function dateAsInstant(date: Date, bound: 'start' | 'end'): string {
  const anchored = new Date(date);
  if (bound === 'start') {
    anchored.setHours(0, 0, 0, 0);
  } else {
    anchored.setHours(23, 59, 59, 999);
  }
  return anchored.toISOString();
}
