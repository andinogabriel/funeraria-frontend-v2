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

import type { Supplier, SupplierAddressResponse } from '../supplier.types';

/**
 * Read-only modal for a supplier. Surfaces the bits the list grid omits — the full mobile
 * number list and every address with its city / province, plus the email and web page as
 * tappable links.
 */
@Component({
  selector: 'app-supplier-detail-dialog',
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
  templateUrl: './supplier-detail-dialog.component.html',
  styleUrl: './supplier-detail-dialog.component.scss',
})
export class SupplierDetailDialogComponent {
  protected readonly data = inject<Supplier>(MAT_DIALOG_DATA);

  /** Mailto href for the supplier's email, or `null` when no email is on file. */
  protected readonly mailto = computed(() =>
    this.data.email ? `mailto:${this.data.email}` : null,
  );

  /** Normalised web URL — adds `https://` when the persisted value omits the scheme. */
  protected readonly webHref = computed(() => {
    const raw = this.data.webPage?.trim();
    if (!raw) {
      return null;
    }
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  });

  /** Pretty-print one address line: "Calle 123, Dpto 2 — Mar del Plata". */
  protected formatAddress(address: SupplierAddressResponse): string {
    const parts: string[] = [];
    if (address.streetName) {
      const head =
        address.blockStreet !== undefined && address.blockStreet !== null
          ? `${address.streetName} ${address.blockStreet}`
          : address.streetName;
      parts.push(head);
    }
    if (address.apartment) {
      parts.push(`Dpto ${address.apartment}`);
    }
    if (address.flat) {
      parts.push(`Piso ${address.flat}`);
    }
    const head = parts.join(', ');
    return address.city?.name ? `${head} — ${address.city.name}` : head || '—';
  }
}
