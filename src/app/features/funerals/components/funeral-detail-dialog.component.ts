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

import type { Funeral } from '../funeral.types';

/**
 * Read-only modal for a funeral. Surfaces every field the list grid omits —
 * full deceased record (DNI / dates / género / parentesco / causa), the
 * snapshot of the plan items at the moment the funeral was registered, the
 * receipt block (type + series + number + tax + total), and the audit
 * trail.
 *
 * The list page opens this from the "Detalle" action; nothing else
 * instantiates it, so the data shape is just the cached `Funeral`.
 */
@Component({
  selector: 'app-funeral-detail-dialog',
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
  templateUrl: './funeral-detail-dialog.component.html',
  styleUrl: './funeral-detail-dialog.component.scss',
})
export class FuneralDetailDialogComponent {
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

  /** Joined "Calle 123, Piso 2 — Mar del Plata" string. `null` when the row has no address. */
  protected readonly placeOfDeathLabel = computed(() => {
    const address = this.data.deceased.placeOfDeath;
    if (!address || !address.streetName) {
      return null;
    }
    const parts: string[] = [address.streetName];
    if (address.blockStreet !== undefined && address.blockStreet !== null) {
      parts[parts.length - 1] += ` ${address.blockStreet}`;
    }
    if (address.apartment) {
      parts.push(`Dpto ${address.apartment}`);
    }
    if (address.flat) {
      parts.push(`Piso ${address.flat}`);
    }
    const head = parts.join(', ');
    return address.city?.name ? `${head} — ${address.city.name}` : head;
  });
}

function formatDate(iso: string): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

function formatDateTime(iso: string): string {
  if (!iso) {
    return '—';
  }
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

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}
