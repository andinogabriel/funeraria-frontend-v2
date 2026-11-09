import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  DUE_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  formatArs,
  formatIsoDate,
  formatPeriod,
  type DueStatus,
  type MembershipAccount,
  type PaymentMethod,
} from '../billing.types';
import { MembershipBillingService } from '../membership-billing.service';

/**
 * Account statement of one holder ("titular"): what the family pays per month, the debt or
 * credit, every due with its status, the payments, and a form to register a new payment. The
 * backend applies a payment to the oldest open dues first and answers with the updated
 * statement, which simply replaces the one on screen.
 */
@Component({
  selector: 'app-holder-account-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './holder-account.page.html',
})
export class HolderAccountPage {
  private readonly service = inject(MembershipBillingService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly snackBar = inject(MatSnackBar);
  private readonly route = inject(ActivatedRoute);

  protected readonly formatArs = formatArs;
  protected readonly formatPeriod = formatPeriod;
  protected readonly formatIsoDate = formatIsoDate;
  protected readonly methods = Object.entries(PAYMENT_METHOD_LABELS) as [PaymentMethod, string][];
  protected readonly methodLabel = (method: PaymentMethod) => PAYMENT_METHOD_LABELS[method];
  protected readonly statusLabel = (status: DueStatus) => DUE_STATUS_LABELS[status];

  protected readonly dni = Number(this.route.snapshot.paramMap.get('dni'));
  protected readonly account = signal<MembershipAccount | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);
  protected readonly saving = signal(false);
  protected readonly today = todayIso();

  /** Dues newest first: the operator looks at the current month before the history. */
  protected readonly dues = computed(() => [...(this.account()?.dues ?? [])].reverse());
  protected readonly payments = computed(() => [...(this.account()?.payments ?? [])].reverse());

  protected readonly paymentForm = this.fb.group({
    amount: this.fb.control<number | null>(null, [Validators.required, Validators.min(0.01)]),
    paidOn: this.fb.control(this.today, [Validators.required]),
    method: this.fb.control<PaymentMethod>('CASH', [Validators.required]),
    reference: this.fb.control('', [Validators.maxLength(100)]),
  });

  constructor() {
    if (!Number.isInteger(this.dni) || this.dni <= 0) {
      this.loading.set(false);
      this.error.set('DNI de titular inválido.');
      return;
    }
    this.service.statement(this.dni).subscribe({
      next: (account) => {
        this.loading.set(false);
        this.account.set(account);
      },
      error: (err: { status?: number }) => {
        this.loading.set(false);
        this.error.set(
          err.status === 404
            ? 'No existe un titular con ese DNI.'
            : 'No se pudo cargar el estado de cuenta.',
        );
      },
    });
  }

  /** Prefills the amount with what is owed, the most common payment. */
  protected onPayBalance(): void {
    const balance = this.account()?.balance ?? 0;
    if (balance > 0) {
      this.paymentForm.controls.amount.setValue(balance);
    }
  }

  protected onRegisterPayment(): void {
    if (this.paymentForm.invalid || this.saving()) {
      this.paymentForm.markAllAsTouched();
      return;
    }
    const value = this.paymentForm.getRawValue();
    const reference = value.reference.trim();
    this.saving.set(true);
    this.service
      .registerPayment(this.dni, {
        amount: value.amount as number,
        paidOn: value.paidOn,
        method: value.method,
        ...(reference ? { reference } : {}),
      })
      .subscribe({
        next: (account) => {
          this.saving.set(false);
          this.account.set(account);
          this.paymentForm.reset({
            amount: null,
            paidOn: this.today,
            method: 'CASH',
            reference: '',
          });
          this.snackBar.open('Pago registrado.', 'Cerrar', { duration: 4000 });
        },
        error: (err: { error?: { detail?: string } }) => {
          this.saving.set(false);
          this.snackBar.open(err.error?.detail ?? 'No se pudo registrar el pago.', 'Cerrar', {
            duration: 6000,
          });
        },
      });
  }

  /** Material tonal pairs per status, so the chip reads at a glance. */
  protected statusClass(status: DueStatus): string {
    switch (status) {
      case 'PAID':
        return 'bg-[var(--mat-sys-secondary-container)] text-[var(--mat-sys-on-secondary-container)]';
      case 'OVERDUE':
        return 'bg-[var(--mat-sys-error-container)] text-[var(--mat-sys-on-error-container)]';
      default:
        return 'bg-[var(--mat-sys-surface-container-highest)] text-[var(--mat-sys-on-surface)]';
    }
  }
}

/** Today as ISO `yyyy-MM-dd` in local time. */
function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
