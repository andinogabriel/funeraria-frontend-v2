import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';

import { MatTooltipModule } from '@angular/material/tooltip';

import { AuthStore } from '../../../core/auth/auth.store';
import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import type { DataTableColumn } from '../../../shared/data-table';
import {
  SelectionListCardComponent,
  type ListCardAction,
} from '../../../shared/selection-list-card';
import { PlanDetailDialogComponent } from '../components/plan-detail-dialog.component';
import { PlanService } from '../plan.service';
import type { Plan } from '../plan.types';

/**
 * Plans list. Shares the visual chrome with affiliates via
 * {@link SelectionListCardComponent}; this page only owns the data shape,
 * the filter logic, and the action handlers (Editar routes to the form,
 * Eliminar confirms + deletes).
 *
 * No detail modal: every plan field already fits in the table or behind the
 * Editar button.
 */
@Component({
  selector: 'app-plan-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
    RouterLink,
    SelectionListCardComponent,
  ],
  templateUrl: './plan-list.page.html',
  styleUrl: './plan-list.page.scss',
})
export class PlanListPage {
  private readonly service = inject(PlanService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly authStore = inject(AuthStore);

  /**
   * `true` when the active session has `ROLE_ADMIN`. Gates the "Papelera"
   * header button — backend endpoint is admin-only. Same pattern used on
   * `/afiliados` and `/servicios`.
   */
  protected readonly isAdmin = computed(() => this.authStore.authorities().includes('ROLE_ADMIN'));

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly rows = computed<readonly Plan[]>(() => this.service.list() ?? []);

  protected readonly selectedPlan = signal<Plan | null>(null);
  protected readonly hasSelection = computed(() => this.selectedPlan() !== null);

  protected readonly columns: readonly DataTableColumn<Plan>[] = [
    {
      key: 'name',
      label: 'Nombre',
      value: (plan) => plan.name,
      hideable: false,
      filter: 'text',
    },
    {
      // Description is free-form long text — sorting it alphabetically has no
      // operator value, and the autocomplete / dateRange / text filters all
      // distort the result set in confusing ways. We surface it as a read-only
      // column with no menu trigger: clicking the header opens nothing.
      key: 'description',
      label: 'Descripción',
      value: (plan) => plan.description ?? '',
      sortable: false,
    },
    {
      key: 'itemCount',
      label: 'Items',
      value: (plan) => plan.itemsPlan.length,
      cellClass: 'tabular-nums text-right',
      headerClass: 'text-right',
      align: 'end',
    },
    {
      key: 'profitPercentage',
      label: 'Margen %',
      value: (plan) => plan.profitPercentage,
      cellClass: 'tabular-nums text-right',
      headerClass: 'text-right',
      align: 'end',
    },
    {
      key: 'price',
      label: 'Precio',
      value: (plan) => formatCurrency(plan.price),
      cellClass: 'tabular-nums text-right whitespace-nowrap',
      headerClass: 'text-right',
      align: 'end',
    },
  ] as const;

  protected readonly trackById = (_: number, row: Plan): number => row.id;

  protected readonly actions = computed<readonly ListCardAction[]>(() => [
    {
      id: 'detail',
      icon: 'visibility',
      label: 'Detalle',
      tooltip: 'Ver detalle',
      disabled: !this.hasSelection(),
      handler: () => this.onShowDetail(),
    },
    {
      id: 'edit',
      icon: 'edit',
      label: 'Editar',
      tooltip: 'Editar plan',
      disabled: !this.hasSelection(),
      handler: () => this.onEdit(),
    },
    {
      id: 'delete',
      icon: 'delete',
      label: 'Eliminar',
      tooltip: 'Eliminar plan',
      kind: 'warn',
      disabled: !this.hasSelection(),
      handler: () => this.onDelete(),
    },
  ]);

  constructor() {
    this.service.loadAll().subscribe();
    // Selection drop-out on filter change is handled by the wrapper.
  }

  /** Opens the read-only detail dialog for the currently-selected plan. */
  private onShowDetail(): void {
    const plan = this.selectedPlan();
    if (!plan) {
      return;
    }
    this.dialog.open(PlanDetailDialogComponent, {
      data: plan,
      width: '560px',
      maxWidth: '95vw',
    });
  }

  private onEdit(): void {
    const plan = this.selectedPlan();
    if (!plan) {
      return;
    }
    void this.router.navigate(['/planes', plan.id, 'editar']);
  }

  private onDelete(): void {
    const plan = this.selectedPlan();
    if (!plan) {
      return;
    }
    const ref = this.dialog.open(ConfirmDialogComponent, {
      width: '420px',
      data: {
        title: 'Eliminar plan',
        message: `¿Estás seguro de querer eliminar el plan "${plan.name}"?`,
        confirmLabel: 'Eliminar',
        cancelLabel: 'Cancelar',
        destructive: true,
      },
    });

    ref.afterClosed().subscribe((confirmed) => {
      if (confirmed !== true) {
        return;
      }
      this.service.delete(plan.id).subscribe({
        next: () => {
          this.selectedPlan.set(null);
          this.snackBar.open('Plan eliminado', 'Cerrar');
        },
        error: () => this.snackBar.open('No se pudo eliminar el plan', 'Cerrar'),
      });
    });
  }

  protected onRefresh(): void {
    this.selectedPlan.set(null);
    this.service.loadAll().subscribe();
  }
}

/** Formats a plan price as Argentine peso currency for the table column. */
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}
