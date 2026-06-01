import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
} from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';

import { DialogHeaderComponent, DraggableDialogDirective } from '../../../shared/dialog-header';
import type { DailyReportPurchaseLine, DailyReportServiceLine } from '../report.types';

/**
 * Data contract for {@link DailyReportDetailDialogComponent}. A discriminated union on `kind` so
 * the same dialog renders either the day's funeral services or its supplier purchases — both cards
 * on the arqueo page open this one component.
 */
export type DailyReportDetailDialogData =
  | {
      readonly kind: 'services';
      /** The day being reconciled, ISO `yyyy-MM-dd` — echoed in the header. */
      readonly date: string;
      readonly total: number;
      readonly lines: readonly DailyReportServiceLine[];
    }
  | {
      readonly kind: 'purchases';
      readonly date: string;
      readonly total: number;
      readonly lines: readonly DailyReportPurchaseLine[];
    };

/**
 * Read-only modal that lists the per-row detail behind a daily-report summary card. Opened from the
 * Servicios / Compras cards on the arqueo page. Mirrors the income-detail-dialog idiom (draggable
 * header + dialog-header component) and keeps its own narrow rows so the operator can scan a day's
 * movement without leaving /arqueo.
 */
@Component({
  selector: 'app-daily-report-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    DialogHeaderComponent,
    DraggableDialogDirective,
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatIconModule,
  ],
  templateUrl: './daily-report-detail-dialog.component.html',
  styleUrl: './daily-report-detail-dialog.component.scss',
})
export class DailyReportDetailDialogComponent {
  protected readonly data = inject<DailyReportDetailDialogData>(MAT_DIALOG_DATA);

  /** Narrowing accessor so the template can branch on the union without repeated casts. */
  protected get services(): readonly DailyReportServiceLine[] {
    return this.data.kind === 'services' ? this.data.lines : [];
  }

  protected get purchases(): readonly DailyReportPurchaseLine[] {
    return this.data.kind === 'purchases' ? this.data.lines : [];
  }
}
