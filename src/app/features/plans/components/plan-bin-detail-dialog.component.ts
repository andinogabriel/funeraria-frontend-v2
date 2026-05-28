import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
} from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatIconModule } from '@angular/material/icon';

import { DialogHeaderComponent, DraggableDialogDirective } from '../../../shared/dialog-header';
import { formatDateTime } from '../../../shared/format';
import type { Plan } from '../plan.types';

/**
 * Read-only modal for a soft-deleted plan, opened from the papelera page.
 *
 * <h3>Why a dialog instead of the regular detail dialog</h3>
 *
 * The active {@link import('./plan-detail-dialog.component').PlanDetailDialogComponent}
 * is the same surface, but the papelera variant also surfaces the tombstone
 * fields (`deletedAt`, `deletedBy`) the regular dialog never sees — those
 * fields are stripped from active responses by `@JsonInclude(NON_NULL)` on
 * the backend DTO, so only the papelera read-path carries them.
 *
 * <h3>Shape</h3>
 *
 * Mirrors the active detail dialog (margen / precio / descripción + items
 * incluidos block) plus a final Auditoría section showing when and by whom
 * the plan was removed. Read-only by design: no restore action — the
 * decision was to keep the papelera consultative only, same as the funeral
 * / affiliate counterparts.
 */
@Component({
  selector: 'app-plan-bin-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogHeaderComponent,
    DraggableDialogDirective,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDividerModule,
    MatExpansionModule,
    MatIconModule,
  ],
  templateUrl: './plan-bin-detail-dialog.component.html',
  styleUrl: './plan-bin-detail-dialog.component.scss',
})
export class PlanBinDetailDialogComponent {
  protected readonly data = inject<Plan>(MAT_DIALOG_DATA);

  protected readonly priceLabel = formatCurrency(this.data.price);
  protected readonly deletedAtLabel = this.data.deletedAt
    ? formatDateTime(this.data.deletedAt)
    : '—';
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}
