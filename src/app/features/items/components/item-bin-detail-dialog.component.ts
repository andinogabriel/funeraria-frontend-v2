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
import type { Item } from '../item.types';

/**
 * Read-only modal for a soft-deleted item, opened from the papelera page.
 *
 * <h3>Why a dedicated dialog instead of the active detail one</h3>
 *
 * The active {@link import('./item-detail-dialog.component').ItemDetailDialogComponent}
 * already surfaces the create / update audit fields. This papelera variant adds the
 * `deletedAt` / `deletedBy` tombstone fields that only the papelera response carries
 * (`@JsonInclude(NON_DEFAULT)` on the backend DTO strips them from active payloads).
 *
 * <h3>Shape</h3>
 *
 * Mirrors the active detail dialog (datos, dimensions, audit) plus a final block
 * showing when and by whom the item was removed. Read-only by design — same shape
 * decided for the funeral / plan papelera dialogs.
 */
@Component({
  selector: 'app-item-bin-detail-dialog',
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
  templateUrl: './item-bin-detail-dialog.component.html',
  styleUrl: './item-bin-detail-dialog.component.scss',
})
export class ItemBinDetailDialogComponent {
  protected readonly data = inject<Item>(MAT_DIALOG_DATA);

  protected readonly priceLabel = formatCurrency(this.data.price);

  protected readonly createdLabel = computed(() => formatDateTime(this.data.createdAt));

  protected readonly updatedLabel = computed(() =>
    this.data.updatedAt ? formatDateTime(this.data.updatedAt) : null,
  );

  protected readonly deletedAtLabel = computed(() =>
    this.data.deletedAt ? formatDateTime(this.data.deletedAt) : '—',
  );

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
