import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import {
  FormArray,
  FormGroup,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';

import { AuthStore } from '../../../core/auth/auth.store';
import { MembershipService } from '../membership.service';
import type { FeeQuote, TariffConfig, TariffConfigUpdate } from '../membership.types';

/**
 * Admin screen for the membership-fee tariff. Reads the config, lets an admin retune the base
 * amount, settings and the per-tier / per-band multipliers, and ships a small fee calculator
 * that exercises the backend `quote` endpoint live.
 *
 * <h3>Form shape</h3>
 *
 * One reactive form mirrors the editable surface: the three settings controls plus two
 * {@link FormArray}s (tiers, bands). The immutable columns (tier `code`, band age range) are
 * disabled controls — shown for context, never sent. For a non-admin the whole form is disabled
 * (the backend would 403 the PUT anyway; disabling keeps the UI honest).
 */
@Component({
  selector: 'app-tariff-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  templateUrl: './tariff.page.html',
  styleUrl: './tariff.page.scss',
})
export class TariffPage implements OnInit {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(MembershipService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly authStore = inject(AuthStore);

  protected readonly isAdmin = computed(() => this.authStore.authorities().includes('ROLE_ADMIN'));
  protected readonly loading = this.service.loading;
  protected readonly error = this.service.error;
  protected readonly config = this.service.config;

  protected readonly saving = signal(false);

  protected readonly form = this.fb.group({
    baseAmount: this.fb.control(0, [Validators.required, Validators.min(0)]),
    maxIssueAge: this.fb.control(0, [Validators.required, Validators.min(0)]),
    overdueGraceCount: this.fb.control(0, [Validators.required, Validators.min(0)]),
    healthTiers: this.fb.array<FormGroup>([]),
    ageBands: this.fb.array<FormGroup>([]),
  });

  // Fee calculator (independent of the edit form).
  protected readonly quoteForm = this.fb.group({
    age: this.fb.control(40, [Validators.required, Validators.min(0)]),
    healthTier: this.fb.control('', [Validators.required]),
  });
  protected readonly quoteResult = signal<FeeQuote | null>(null);
  protected readonly quoting = signal(false);
  protected readonly quoteError = signal<string | null>(null);

  protected get tiers(): FormArray<FormGroup> {
    return this.form.controls.healthTiers;
  }

  protected get bands(): FormArray<FormGroup> {
    return this.form.controls.ageBands;
  }

  ngOnInit(): void {
    this.service.loadConfig().subscribe({
      next: (config) => this.buildForm(config),
      error: () => undefined,
    });
  }

  private buildForm(config: TariffConfig): void {
    this.form.controls.baseAmount.setValue(config.baseAmount);
    this.form.controls.maxIssueAge.setValue(config.maxIssueAge);
    this.form.controls.overdueGraceCount.setValue(config.overdueGraceCount);

    this.tiers.clear();
    for (const tier of config.healthTiers) {
      this.tiers.push(
        this.fb.group({
          id: this.fb.control(tier.id),
          code: this.fb.control({ value: tier.code, disabled: true }),
          name: this.fb.control(tier.name, [Validators.required]),
          healthMultiplier: this.fb.control(tier.healthMultiplier, [
            Validators.required,
            Validators.min(0),
          ]),
          waitingPeriodMonths: this.fb.control(tier.waitingPeriodMonths, [
            Validators.required,
            Validators.min(0),
          ]),
        }),
      );
    }

    this.bands.clear();
    for (const band of config.ageBands) {
      this.bands.push(
        this.fb.group({
          id: this.fb.control(band.id),
          range: this.fb.control({
            value: band.maxAge === null ? `${band.minAge}+` : `${band.minAge}-${band.maxAge}`,
            disabled: true,
          }),
          label: this.fb.control(band.label, [Validators.required]),
          ageMultiplier: this.fb.control(band.ageMultiplier, [
            Validators.required,
            Validators.min(0),
          ]),
        }),
      );
    }

    // Default the calculator's tier select to the first available tier.
    if (config.healthTiers.length > 0) {
      this.quoteForm.controls.healthTier.setValue(config.healthTiers[0].code);
    }

    if (!this.isAdmin()) {
      this.form.disable();
    }
  }

  protected onSave(): void {
    if (this.form.invalid || !this.isAdmin()) {
      this.form.markAllAsTouched();
      return;
    }
    const raw = this.form.getRawValue();
    const request: TariffConfigUpdate = {
      baseAmount: raw.baseAmount,
      maxIssueAge: raw.maxIssueAge,
      overdueGraceCount: raw.overdueGraceCount,
      healthTiers: raw.healthTiers.map((t) => ({
        id: t['id'] as number,
        name: t['name'] as string,
        healthMultiplier: t['healthMultiplier'] as number,
        waitingPeriodMonths: t['waitingPeriodMonths'] as number,
      })),
      ageBands: raw.ageBands.map((b) => ({
        id: b['id'] as number,
        ageMultiplier: b['ageMultiplier'] as number,
        label: b['label'] as string,
      })),
    };

    this.saving.set(true);
    this.service.updateConfig(request).subscribe({
      next: () => {
        this.saving.set(false);
        this.snackBar.open('Tarifario actualizado.', 'Cerrar', { duration: 4000 });
      },
      error: (err: { error?: { detail?: string } }) => {
        this.saving.set(false);
        this.snackBar.open(err.error?.detail ?? 'No se pudo guardar el tarifario.', 'Cerrar', {
          duration: 6000,
        });
      },
    });
  }

  protected onQuote(): void {
    if (this.quoteForm.invalid) {
      this.quoteForm.markAllAsTouched();
      return;
    }
    const { age, healthTier } = this.quoteForm.getRawValue();
    this.quoting.set(true);
    this.quoteError.set(null);
    this.service.quote(age, healthTier).subscribe({
      next: (result) => {
        this.quoting.set(false);
        this.quoteResult.set(result);
      },
      error: (err: { error?: { detail?: string } }) => {
        this.quoting.set(false);
        this.quoteResult.set(null);
        this.quoteError.set(err.error?.detail ?? 'No se pudo cotizar.');
      },
    });
  }

  /** Maps a non-insurable reason code to a Spanish operator message. */
  protected quoteReasonLabel(reason: string | null): string {
    switch (reason) {
      case 'ABOVE_MAX_ISSUE_AGE':
        return 'La edad supera el máximo de ingreso permitido.';
      case 'NO_AGE_BAND':
        return 'No hay una franja etaria que cubra esa edad.';
      default:
        return 'No asegurable.';
    }
  }

  protected formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0,
    }).format(value);
  }
}
