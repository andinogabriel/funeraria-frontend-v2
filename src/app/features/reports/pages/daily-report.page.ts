import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ReportService } from '../report.service';
import type { DailyReport } from '../report.types';

/**
 * Daily cash-reconciliation page ("arqueo diario"). Admin-only — backend gates
 * `GET /api/v1/reports/daily` with `ROLE_ADMIN` and the sidenav hides the entry for non-admins,
 * so we don't add a route guard (the service surfaces the friendly 403 if someone deep-links).
 *
 * <p>One date picker drives one fetch. Three summary cards render the result: servicios (money in),
 * compras (money out) and the net. The page defaults to today and loads on init so the operator
 * lands on the current day's close without a click.
 */
@Component({
  selector: 'app-daily-report-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
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

  /** Narrowing helper for the template so `report()` is non-null inside the result block. */
  protected asReport(value: DailyReport | null): DailyReport | null {
    return value;
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
