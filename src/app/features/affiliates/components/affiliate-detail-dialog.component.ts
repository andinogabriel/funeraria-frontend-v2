import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import type { Affiliate } from '../affiliate.types';

/**
 * Modal that surfaces affiliate detail that does not fit comfortably in the list grid.
 *
 * The affiliate-list page only exposes the operational columns (DNI, surname, name,
 * birth date, relationship). Once a user picks a row and clicks "Detalle", this dialog
 * shows the full record — including the columns the grid hides by default (gender) and
 * the columns the grid does not surface at all (start date, deceased flag, age
 * computed from `birthDate`).
 *
 * It is intentionally read-only. Edits go through the dedicated `/afiliados/:dni/editar`
 * route so the same validation, stepper UX and unsaved-changes safeguards apply for
 * every modification path.
 */
@Component({
  selector: 'app-affiliate-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatIconModule,
  ],
  templateUrl: './affiliate-detail-dialog.component.html',
  styleUrl: './affiliate-detail-dialog.component.scss',
})
export class AffiliateDetailDialogComponent {
  protected readonly data = inject<Affiliate>(MAT_DIALOG_DATA);

  /**
   * Age in years computed from `birthDate`. We compute on the client because the
   * backend does not surface an `age` field and we want the modal to read like a
   * complete affiliate profile. The arithmetic accounts for the month/day boundary
   * so an affiliate born last week registers as 0, not 1.
   */
  protected readonly age = computeAge(this.data.birthDate);

  /**
   * Friendly birth-date label. The backend ships ISO `yyyy-MM-dd`; we render it
   * `dd/MM/yyyy` to match the locale the rest of the UI uses.
   */
  protected readonly birthDateLabel = formatIsoToLocaleDate(this.data.birthDate);

  /**
   * Friendly start-date label (affiliate enrolment date). Same format normalisation
   * as the birth date — see {@link formatIsoToLocaleDate}.
   */
  protected readonly startDateLabel = formatIsoToLocaleDate(this.data.startDate);
}

/**
 * Calculates whole-year age from an ISO `yyyy-MM-dd` birth-date string. Returns
 * `null` for malformed inputs rather than `NaN` so the template can render an em
 * dash without a runtime check.
 */
function computeAge(isoBirthDate: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoBirthDate);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  const birth = new Date(Number(year), Number(month) - 1, Number(day));
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

/**
 * Reformats a `yyyy-MM-dd` date into `dd/MM/yyyy`. Returns the original string for
 * unparseable input so the user still sees the raw value instead of a swallowed
 * empty cell — useful while diagnosing backend payload drift.
 */
function formatIsoToLocaleDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    return isoDate;
  }
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
