import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';

import type { Plan } from '../plan.types';

/**
 * Read-only modal that surfaces the full plan record — including the items
 * sub-list the list grid only shows as a count. Edits route through
 * `PlanFormPage` so the validation + items sub-form path stays canonical.
 */
@Component({
  selector: 'app-plan-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatDividerModule,
    MatIconModule,
  ],
  templateUrl: './plan-detail-dialog.component.html',
  styleUrl: './plan-detail-dialog.component.scss',
})
export class PlanDetailDialogComponent {
  protected readonly data = inject<Plan>(MAT_DIALOG_DATA);

  protected readonly priceLabel = formatCurrency(this.data.price);
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}
