import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
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

import type { Item } from '../item.types';

/**
 * Read-only modal that surfaces the full item record — including the audit
 * trail (who created the row and when, who last touched it) that the list
 * grid intentionally omits.
 *
 * `updatedAt` / `updatedBy` are nullable on the wire because Spring Data
 * only populates them on subsequent saves. New rows show up with the
 * "Sin modificaciones" hint instead of an empty cell so the operator can
 * tell the row was created and never touched again versus a missing audit.
 */
@Component({
  selector: 'app-item-detail-dialog',
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
  templateUrl: './item-detail-dialog.component.html',
  styleUrl: './item-detail-dialog.component.scss',
})
export class ItemDetailDialogComponent {
  protected readonly data = inject<Item>(MAT_DIALOG_DATA);

  protected readonly priceLabel = formatCurrency(this.data.price);

  protected readonly createdLabel = computed(() => formatInstant(this.data.createdAt));

  /** Returns `null` when the row has never been updated since creation. */
  protected readonly updatedLabel = computed(() =>
    this.data.updatedAt ? formatInstant(this.data.updatedAt) : null,
  );

  /**
   * Whether the item carries physical dimensions worth showing. Avoids
   * rendering an empty dimensions block for catalog entries (cremation
   * services, flowers, etc.) where the three measurements are always null.
   */
  protected readonly hasDimensions = computed(
    () =>
      this.data.itemLength !== null ||
      this.data.itemHeight !== null ||
      this.data.itemWidth !== null,
  );
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

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
