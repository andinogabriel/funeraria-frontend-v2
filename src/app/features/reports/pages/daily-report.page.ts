import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';

import { IncomeDetailDialogComponent } from '../../incomes/components/income-detail-dialog.component';
import { IncomeService } from '../../incomes/income.service';
import { ReportService } from '../report.service';
import type { DailyReportPurchaseLine, DailyReportServiceLine } from '../report.types';

/**
 * Daily cash-reconciliation page ("arqueo diario"). Admin-only — backend gates
 * `GET /api/v1/reports/daily` with `ROLE_ADMIN` and the sidenav hides the entry for non-admins,
 * so we don't add a route guard (the service surfaces the friendly 403 if someone deep-links).
 *
 * <p>One date picker drives one fetch. The Neto card sits up top; the Servicios and Compras detail
 * live in two always-expanded panels below so the operator sees the day's full movement at a
 * glance and uses the vertical space. Each row drills into the canonical detail surface:
 *
 * <ul>
 *   <li>a service row navigates to {@code /servicios/:id} (the funeral detail page);</li>
 *   <li>a purchase row fetches the full income by receipt number and opens the same
 *       {@code IncomeDetailDialogComponent} the /ingresos grid uses, so the operator gets the
 *       identical item breakdown + audit panel.</li>
 * </ul>
 */
@Component({
  selector: 'app-daily-report-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  templateUrl: './daily-report.page.html',
  styleUrl: './daily-report.page.scss',
})
export class DailyReportPage {
  private readonly service = inject(ReportService);
  private readonly incomeService = inject(IncomeService);
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly report = this.service.report;

  /**
   * Selected day. Initialised to today; the datepicker is capped at today via `[max]` because a
   * future-dated arqueo is meaningless (no services or purchases can be registered ahead of time).
   */
  protected readonly dateControl = new FormControl<Date>(new Date(), { nonNullable: true });

  /** Upper bound for the picker — the operator cannot reconcile a day that hasn't happened. */
  protected readonly today = new Date();

  /** `true` when the net is negative (more spent on stock than taken in), to tint the net card. */
  protected readonly netIsNegative = computed<boolean>(() => (this.report()?.net ?? 0) < 0);

  constructor() {
    this.load();
  }

  /** Re-fetches for the currently picked day. Bound to the picker's change + the refresh button. */
  protected load(): void {
    const date = this.dateControl.value;
    this.service.loadDaily(toIsoDate(date)).subscribe({ error: () => undefined });
  }

  /**
   * Navigates to the funeral detail page for a service row — the same {@code /servicios/:id} route
   * the services grid drills into, so the operator lands on the familiar surface.
   */
  protected openService(line: DailyReportServiceLine): void {
    void this.router.navigate(['/servicios', line.funeralId]);
  }

  /**
   * Opens the canonical income detail dialog for a purchase row. The arqueo line only carries the
   * receipt number + supplier, so we fetch the full income first (item breakdown, audit, etc.) and
   * hand it to the same {@code IncomeDetailDialogComponent} the /ingresos grid uses.
   */
  protected openPurchase(line: DailyReportPurchaseLine): void {
    this.incomeService.findByReceiptNumber(line.receiptNumber).subscribe({
      next: (income) =>
        this.dialog.open(IncomeDetailDialogComponent, {
          data: income,
          width: '640px',
          maxWidth: '95vw',
        }),
      error: () => this.snackBar.open('No se pudo cargar el detalle del ingreso', 'Cerrar'),
    });
  }
}

/**
 * Formats a JS `Date` as a local `yyyy-MM-dd` string for the query param. Built from the local
 * calendar fields (not `toISOString`, which would shift to UTC and can roll the date back a day for
 * Argentina's UTC-3 offset).
 */
function toIsoDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
