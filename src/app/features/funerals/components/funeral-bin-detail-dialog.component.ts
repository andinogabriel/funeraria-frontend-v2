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
import { formatDate, formatDateTime } from '../../../shared/format';
import type { Funeral } from '../funeral.types';

/**
 * Read-only modal for a soft-deleted funeral, opened from the papelera page.
 *
 * <h3>Why a dialog instead of navigating to {@code /servicios/:id}</h3>
 *
 * The dedicated detail route relies on
 * {@code FuneralService.findById} + {@code loadAll}, both of which filter out
 * soft-deleted rows by contract (the backend's
 * {@code where deletedAt is null} predicate fires on every operational read).
 * Navigating a deleted id through that path would land on the "no encontramos
 * el servicio" empty state. The papelera already holds the full
 * {@link Funeral} in memory, so a dialog over that data is the simplest
 * single-source-of-truth approach.
 *
 * <h3>Shape</h3>
 *
 * Mirrors the field set the active detail page surfaces (Servicio /
 * Fallecido / Recibo / Plan items snapshot) plus the Auditoría block —
 * registered + the tombstone (Eliminado + Eliminado por). Read-only by
 * design: no PDF, no edit, no delete-from-papelera actions.
 */
@Component({
  selector: 'app-funeral-bin-detail-dialog',
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
  templateUrl: './funeral-bin-detail-dialog.component.html',
  styleUrl: './funeral-bin-detail-dialog.component.scss',
})
export class FuneralBinDetailDialogComponent {
  protected readonly data = inject<Funeral>(MAT_DIALOG_DATA);

  protected readonly title = computed(
    () => `${this.data.deceased.firstName} ${this.data.deceased.lastName}`,
  );

  protected readonly funeralDateLabel = formatDateTime(this.data.funeralDate);
  protected readonly registerDateLabel = formatDateTime(this.data.registerDate);
  protected readonly birthDateLabel = formatDate(this.data.deceased.birthDate);
  protected readonly deathDateLabel = formatDate(this.data.deceased.deathDate);
  protected readonly totalLabel = formatCurrency(this.data.totalAmount);
  protected readonly taxLabel =
    this.data.tax !== null && this.data.tax !== undefined ? `${this.data.tax} %` : '—';
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
