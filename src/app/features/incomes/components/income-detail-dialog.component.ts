import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';

import { DialogHeaderComponent, DraggableDialogDirective } from '../../../shared/dialog-header';
import { formatDateTime } from '../../../shared/format';
import type { Income } from '../income.types';

/**
 * Read-only modal for an income. Surfaces the bits the paginated grid omits: full supplier
 * info, the user who registered the receipt, the audit pair (last-modified date + by), and
 * the line-item breakdown with per-row purchase + sale price.
 */
@Component({
  selector: 'app-income-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogHeaderComponent,
    DraggableDialogDirective,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDividerModule,
    MatIconModule,
  ],
  templateUrl: './income-detail-dialog.component.html',
  styleUrl: './income-detail-dialog.component.scss',
})
export class IncomeDetailDialogComponent {
  protected readonly data = inject<Income>(MAT_DIALOG_DATA);

  protected readonly incomeDateLabel = formatDateTime(this.data.incomeDate);
  protected readonly lastModifiedLabel = computed(() =>
    this.data.lastModifiedDate ? formatDateTime(this.data.lastModifiedDate) : null,
  );
  protected readonly totalLabel = formatCurrency(this.data.totalAmount);
  protected readonly taxLabel = `${this.data.tax} %`;

  protected formatCurrency = formatCurrency;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}
