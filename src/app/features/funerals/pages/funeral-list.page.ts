import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  TemplateRef,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import type { DataTableAutocompleteOption, DataTableColumn } from '../../../shared/data-table';
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

  protected readonly rows = computed<readonly Funeral[]>(() => this.service.list() ?? []);

  protected readonly selectedFuneral = signal<Funeral | null>(null);
  protected readonly hasSelection = computed(() => this.selectedFuneral() !== null);

  /**
   * Cell renderers for the date and currency columns. The columns' `value`
   * accessor returns the raw sortable form (ISO string for dates, number for
   * currency) so client-side sort is chronological / numerical; the
   * templates render the operator-facing format. Wired through `viewChild`
   * so the columns array can be a computed signal.
   */
  private readonly funeralDateCell =
    viewChild<TemplateRef<{ $implicit: Funeral }>>('funeralDateCell');
  private readonly totalCell = viewChild<TemplateRef<{ $implicit: Funeral }>>('totalCell');

  /**
   * Distinct plan names derived from the currently-loaded funerals. The
   * autocomplete suggestion list mirrors what the table actually contains so
   * picking a plan the operator can see is the only useful intent.
   */
  private readonly planOptions = computed<readonly DataTableAutocompleteOption[]>(() => {
    const distinct = new Set<string>();
    for (const funeral of this.rows()) {
      if (funeral.plan?.name) {
        distinct.add(funeral.plan.name);
      }
    }
    return Array.from(distinct)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((name) => ({ value: name, label: name }));
  });

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
      // ISO `yyyy-MM-ddTHH:mm` sorts chronologically as a string, so the
      // grid sort works without any custom comparator. The cell renders the
      // localized `dd/MM/yyyy HH:mm` via the projected template.
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
      autocomplete: {
        options: () => this.planOptions(),
        minSearchChars: 0,
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
      // Numeric value for sort; the template formats it as ARS currency.
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
    // Selection drop-out on filter change is handled by the wrapper.
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
