import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import { debounceTime } from 'rxjs/operators';

import { ConfirmDialogComponent } from '../../../shared/confirm-dialog/confirm-dialog.component';
import { DataTableComponent, type DataTableColumn } from '../../../shared/data-table';
import { PlanService } from '../plan.service';
import type { Plan } from '../plan.types';

/**
 * Plans list. Reuses the affiliate pattern that QA already validated: client-side
 * filtered table, single-row selection driving an action toolbar (Editar / Eliminar),
 * fixed 10-row footprint with the paginator sticky on mobile.
 *
 * There is no detail modal: every plan field already fits in the table or behind the
 * Editar button (`PlanFormPage` shows everything in read/write mode). If a separate
 * read-only view earns its keep, this is the place to add it.
 */
@Component({
  selector: 'app-plan-list-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DataTableComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTooltipModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './plan-list.page.html',
  styleUrl: './plan-list.page.scss',
})
export class PlanListPage {
  private readonly service = inject(PlanService);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;

  protected readonly search = new FormControl('', { nonNullable: true });

  private readonly searchTerm = signal('');

  protected readonly hasSearchValue = computed(() => this.searchTerm().length > 0);

  protected readonly selectedPlan = signal<Plan | null>(null);
  protected readonly hasSelection = computed(() => this.selectedPlan() !== null);

  protected readonly filtered = computed<readonly Plan[]>(() => {
    const all = this.service.list() ?? [];
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) {
      return all;
    }
    return all.filter((plan) => plan.name.toLowerCase().includes(term));
  });

  protected readonly columns: readonly DataTableColumn<Plan>[] = [
    {
      key: 'name',
      label: 'Nombre',
      value: (plan) => plan.name,
      hideable: false,
    },
    {
      key: 'description',
      label: 'Descripción',
      value: (plan) => plan.description ?? '',
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

  constructor() {
    this.service.loadAll().subscribe();

    this.search.valueChanges.pipe(debounceTime(150), takeUntilDestroyed()).subscribe((value) => {
      this.searchTerm.set(value);
    });

    // Mirror the affiliates effect: drop the selection when the picked row is no
    // longer in the filtered view (filter excludes it, refresh removes it, etc.).
    effect(() => {
      const selected = this.selectedPlan();
      if (selected === null) {
        return;
      }
      const visible = this.filtered();
      if (!visible.some((plan) => plan.id === selected.id)) {
        this.selectedPlan.set(null);
      }
    });
  }

  protected onEdit(): void {
    const plan = this.selectedPlan();
    if (!plan) {
      return;
    }
    void this.router.navigate(['/planes', plan.id, 'editar']);
  }

  protected onDelete(): void {
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
          this.snackBar.open('Plan eliminado', 'OK', { duration: 3000 });
        },
        error: () => this.snackBar.open('No se pudo eliminar el plan', 'OK', { duration: 5000 }),
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
