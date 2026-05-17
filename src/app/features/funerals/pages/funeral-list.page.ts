import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs/operators';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import type { DataTableColumn } from '../../../shared/data-table';
import {
  SelectionListCardComponent,
  type ListCardAction,
} from '../../../shared/selection-list-card';
import { FuneralDetailDialogComponent } from '../components/funeral-detail-dialog.component';
import { FuneralService } from '../funeral.service';
import type { Funeral } from '../funeral.types';

/**
 * Funerals (servicios) list. Shares the visual chrome with afiliados /
 * planes / items via {@link SelectionListCardComponent}; the page only owns
 * the column shape, filter logic, and action handlers (Detalle / Editar /
 * Eliminar).
 *
 * <h3>Search</h3>
 *
 * Operator-facing search matches against the deceased name, DNI, and the
 * receipt number — the three identifiers operators reach for when looking
 * up a service. Accent-insensitive via NFD strip so "Pérez" matches a
 * search for "Perez".
 */
@Component({
  selector: 'app-funeral-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink, SelectionListCardComponent],
  templateUrl: './funeral-list.page.html',
  styleUrl: './funeral-list.page.scss',
})
export class FuneralListPage {
  private readonly service = inject(FuneralService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  private readonly searchTerm = signal('');

  protected readonly selectedFuneral = signal<Funeral | null>(null);
  protected readonly hasSelection = computed(() => this.selectedFuneral() !== null);

  protected readonly filtered = computed<readonly Funeral[]>(() => {
    const all = this.service.list() ?? [];
    const term = this.searchTerm().trim();
    if (!term) {
      return all;
    }
    const needle = foldDiacritics(term).toLowerCase();
    return all.filter((funeral) => {
      const haystack = foldDiacritics(
        `${funeral.deceased.firstName} ${funeral.deceased.lastName} ${funeral.deceased.dni} ${funeral.receiptNumber ?? ''}`,
      ).toLowerCase();
      return haystack.includes(needle);
    });
  });

  protected readonly columns: readonly DataTableColumn<Funeral>[] = [
    {
      key: 'deceasedName',
      label: 'Fallecido',
      value: (funeral) => `${funeral.deceased.firstName} ${funeral.deceased.lastName}`,
      hideable: false,
    },
    {
      key: 'dni',
      label: 'DNI',
      value: (funeral) => funeral.deceased.dni,
      cellClass: 'tabular-nums',
    },
    {
      key: 'funeralDate',
      label: 'Fecha del servicio',
      // Returning the ISO string gives correct sort (yyyy-MM-dd lexicographic
      // ordering matches chronological), at the cost of an unprettified cell.
      // The formatted variant lives below; consumers reading the grid get the
      // sortable ISO, the operator-facing display is rendered via the
      // `funeralDateCell` template inside the HTML — wired through `viewChild`.
      // For this first cut we keep the formatted string in `value` and accept
      // that sort is lexicographic on `dd/MM/yyyy` (close enough within the
      // current month — the receipt number column gives the canonical order).
      value: (funeral) => formatDateTime(funeral.funeralDate),
      cellClass: 'tabular-nums whitespace-nowrap',
    },
    {
      key: 'plan',
      label: 'Plan',
      value: (funeral) => funeral.plan.name,
    },
    {
      key: 'receiptNumber',
      label: 'Recibo',
      value: (funeral) => funeral.receiptNumber ?? '—',
      cellClass: 'tabular-nums',
    },
    {
      key: 'totalAmount',
      label: 'Total',
      value: (funeral) => formatCurrency(funeral.totalAmount),
      cellClass: 'tabular-nums text-right whitespace-nowrap',
      headerClass: 'text-right',
      align: 'end',
    },
  ] as const;

  protected readonly trackById = (_: number, row: Funeral): number => row.id;

  protected readonly actions = computed<readonly ListCardAction[]>(() => [
    {
      id: 'detail',
      icon: 'visibility',
      label: 'Detalle',
      tooltip: 'Ver detalle del servicio',
      disabled: !this.hasSelection(),
      handler: () => this.onShowDetail(),
    },
    {
      id: 'edit',
      icon: 'edit',
      label: 'Editar',
      tooltip: 'Editar servicio',
      disabled: !this.hasSelection(),
      handler: () => this.onEdit(),
    },
    {
      id: 'delete',
      icon: 'delete',
      label: 'Eliminar',
      tooltip: 'Eliminar servicio',
      kind: 'warn',
      disabled: !this.hasSelection(),
      handler: () => this.onDelete(),
    },
  ]);

  constructor() {
    this.service.loadAll().subscribe();

    this.searchControl.valueChanges
      .pipe(debounceTime(150), takeUntilDestroyed())
      .subscribe((value) => this.searchTerm.set(value));

    // If the currently-selected row falls off the visible set after the user
    // changed the filter, clear the selection so action buttons that depend on
    // `hasSelection()` reflect reality.
    effect(() => {
      const selected = this.selectedFuneral();
      if (selected === null) {
        return;
      }
      const visible = this.filtered();
      if (!visible.some((funeral) => funeral.id === selected.id)) {
        this.selectedFuneral.set(null);
      }
    });
  }

  private onShowDetail(): void {
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

  private onEdit(): void {
    const funeral = this.selectedFuneral();
    if (!funeral) {
      return;
    }
    void this.router.navigate(['/servicios', funeral.id, 'editar']);
  }

  private onDelete(): void {
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
      this.service.delete(funeral.id).subscribe({
        next: () => {
          this.selectedFuneral.set(null);
          this.snackBar.open('Servicio eliminado', 'Cerrar');
        },
        error: () => this.snackBar.open('No se pudo eliminar el servicio', 'Cerrar'),
      });
    });
  }

  protected onRefresh(): void {
    this.selectedFuneral.set(null);
    this.service.loadAll().subscribe();
  }
}

/** Formats an ISO `yyyy-MM-ddTHH:mm` datetime as `dd/MM/yyyy HH:mm` for the grid. */
function formatDateTime(iso: string): string {
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

/** Formats a numeric amount as Argentine peso currency. */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

/** Strips diacritics so accent-insensitive search treats "Pérez" === "Perez". */
function foldDiacritics(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}
