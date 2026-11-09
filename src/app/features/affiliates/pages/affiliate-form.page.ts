import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, merge, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';

import { CatalogsService } from '../../catalogs/catalogs.service';
import type { Gender, Relationship } from '../../catalogs/catalogs.types';
import { readListReturnUrl } from '../../../shared/navigation';
import { FieldSkeletonDirective } from '../../../shared/skeleton';
import { MembershipService } from '../../membership/membership.service';
import type { FeeQuote } from '../../membership/membership.types';
import { AffiliateService } from '../affiliate.service';
import type { Affiliate, AffiliateRequest } from '../affiliate.types';

/** What the form knows about the holder DNI typed in the billing step. */
type HolderLookup =
  | { readonly kind: 'existing'; readonly activeAffiliates: number; readonly monthlyTotal: number }
  | { readonly kind: 'new' };

/**
 * Single component for both create and edit because the form layout is identical and
 * the differences (submit method, page title, prefilled values) collapse to two
 * conditionals. The mode + edit DNI are read from the route snapshot in the field
 * initializer; both are available synchronously before the constructor runs so the
 * form can hydrate without an extra effect or a `null` placeholder.
 *
 * <h3>Two-step wizard</h3>
 *
 * The form is split into two FormGroups (`personal` and `classification`) hosted by a
 * {@link MatStepperModule} stepper so the user is guided through a clear "this then
 * that" flow on every viewport. The stepper orientation is wired to the CDK
 * BreakpointObserver: horizontal on tablet+ (better use of desktop's horizontal real
 * estate) and vertical on phones (where horizontal step labels would wrap or get
 * cropped). `linear` is enabled so the user cannot fast-forward to step 2 with an
 * invalid step 1.
 *
 * <h3>Catalog selects</h3>
 *
 * Gender and relationship dropdowns read from the shared {@link CatalogsService}
 * cache. The submit button on the last step stays disabled until both catalogs
 * resolve so we never POST a half-set payload.
 *
 * <h3>Holder and fee (billing)</h3>
 *
 * The third section collects the holder ("titular": who pays and claims) and the health tier.
 * Typing a holder DNI looks the holder up and prefills a returning one; the fee preview quotes
 * the tariff live from the birth date and tier, so the operator sees the monthly amount (or that
 * the person is not insurable) before saving. The backend prices the fee itself; the preview is
 * informational only.
 */
@Component({
  selector: 'app-affiliate-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FieldSkeletonDirective,
    MatButtonModule,
    MatCardModule,
    MatDatepickerModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatStepperModule,
    NgTemplateOutlet,
    ReactiveFormsModule,
  ],
  templateUrl: './affiliate-form.page.html',
  styleUrl: './affiliate-form.page.scss',
})
export class AffiliateFormPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly catalogs = inject(CatalogsService);
  private readonly service = inject(AffiliateService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly breakpointObserver = inject(BreakpointObserver);
  private readonly membership = inject(MembershipService);
  private readonly destroyRef = inject(DestroyRef);

  /** Drives create vs. edit. Read from the static route data at construction time. */
  protected readonly mode: 'create' | 'edit' =
    this.route.snapshot.data['mode'] === 'edit' ? 'edit' : 'create';

  /** DNI of the affiliate being edited (or `null` in create mode / malformed segment). */
  private readonly editDni: number | null = this.parseEditDni();

  /**
   * URL to return to on Cancel / back / successful save. Snapshotted from
   * `history.state` so a save still drops the operator back into the exact
   * filter slice they came from. Falls back to the bare listing for deep-
   * links and the Nuevo-afiliado flow.
   */
  protected readonly listReturnUrl: string = readListReturnUrl('/afiliados');

  protected readonly genders = this.catalogs.genders;
  protected readonly relationships = this.catalogs.relationships;

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly title = this.mode === 'create' ? 'Nuevo afiliado' : 'Editar afiliado';

  /** Health tiers from the tariff config; `null` until it loads. */
  protected readonly healthTiers = computed(() => this.membership.config()?.healthTiers ?? null);

  protected readonly catalogsReady = computed(
    () => this.genders() !== null && this.relationships() !== null && this.healthTiers() !== null,
  );

  /** Live fee preview for the current birth date + tier; `null` while inputs are incomplete. */
  protected readonly quote = signal<FeeQuote | null>(null);

  /** Result of looking up the typed holder DNI; `null` before any lookup. */
  protected readonly holderLookup = signal<HolderLookup | null>(null);

  /**
   * In edit mode, gates the per-field skeleton on the fields that get
   * hydrated from the cached record (`patchFrom`). Starts {@code true} in
   * create mode (no record to fetch) and flips to {@code true} the moment
   * `patchFrom` runs or the record lookup fails. The fields therefore show
   * the shimmer overlay only while there genuinely is no data to display.
   */
  protected readonly recordReady = signal(this.mode === 'create');

  /**
   * Convenience flag for catalog-backed selects: they need both the catalog
   * AND the record (in edit mode) before they can render a meaningful value.
   */
  protected readonly selectReady = computed(() => this.catalogsReady() && this.recordReady());

  /** Upper bound for the birth-date picker — affiliates cannot be in the future. */
  protected readonly today = new Date();

  /**
   * Step 1: personal data. Kept as its own FormGroup so the linear stepper can
   * validate the step in isolation (`[stepControl]="personal"`).
   */
  protected readonly personal = this.fb.group({
    firstName: this.fb.control('', { validators: [Validators.required, Validators.maxLength(60)] }),
    lastName: this.fb.control('', { validators: [Validators.required, Validators.maxLength(60)] }),
    dni: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(1_000_000), Validators.max(99_999_999)],
    }),
    birthDate: this.fb.control<Date | null>(null, { validators: [Validators.required] }),
  });

  /** Step 2: classification. Same FormGroup-per-step pattern as `personal`. */
  protected readonly classification = this.fb.group({
    genderId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
    relationshipId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
  });

  /** Step 3: holder (who pays) and the health tier that prices the fee. */
  protected readonly billing = this.fb.group({
    holderDni: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(1_000_000), Validators.max(99_999_999)],
    }),
    holderFirstName: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    holderLastName: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(70)],
    }),
    holderPhone: this.fb.control('', { validators: [Validators.maxLength(30)] }),
    holderEmail: this.fb.control('', { validators: [Validators.email, Validators.maxLength(255)] }),
    healthTierCode: this.fb.control('', { validators: [Validators.required] }),
    /**
     * Enrolment date ("fecha de alta"): the claim waiting period counts from it. Today for a new
     * affiliate; editable so back-dated and legacy enrolments carry their real date.
     */
    enrolmentDate: this.fb.control<Date | null>(new Date(), { validators: [Validators.required] }),
  });

  /**
   * `true` on phones / small tablets. Drives the wizard-vs-single-card layout
   * decision: the wizard is great for narrow viewports (one step at a time
   * keeps the keyboard from covering half the form) but on desktop the form
   * is short enough that a single card with two sections is a less clicky UX.
   */
  protected readonly isHandset = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  constructor() {
    // Load catalogs in parallel; the form selects bind to the resulting signals.
    forkJoin([this.catalogs.loadGenders(), this.catalogs.loadRelationships()]).subscribe();
    this.membership.loadConfig().subscribe({
      error: () => this.errorMessage.set('No se pudo cargar el tarifario.'),
    });

    // Fee preview: re-quote whenever the birth date or the tier changes. switchMap drops a stale
    // quote when the operator changes the inputs faster than the server answers.
    merge(
      this.personal.controls.birthDate.valueChanges,
      this.billing.controls.healthTierCode.valueChanges,
    )
      .pipe(
        map(() => ({
          birthDate: this.personal.controls.birthDate.value,
          tier: this.billing.controls.healthTierCode.value,
        })),
        switchMap(({ birthDate, tier }) =>
          birthDate && tier
            ? this.membership
                .quote(ageOn(birthDate, new Date()), tier)
                .pipe(catchError(() => of(null)))
            : of(null),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((quote) => this.quote.set(quote));

    // If we're in edit mode, hydrate from the service cache. If the cache is cold
    // (deep-link to /afiliados/:dni/editar with no prior list visit), we kick off a
    // load and try again. `recordReady` flips to true on every terminal branch so
    // the per-field skeleton stops shimmering even when the record is missing.
    if (this.editDni !== null) {
      const cached = this.service.findByDni(this.editDni);
      if (cached) {
        this.patchFrom(cached);
        this.recordReady.set(true);
      } else {
        this.service.loadActive().subscribe(() => {
          const fresh = this.service.findByDni(this.editDni as number);
          if (fresh) {
            this.patchFrom(fresh);
          } else {
            this.errorMessage.set('No se encontró el afiliado solicitado.');
            this.personal.disable();
            this.classification.disable();
            this.billing.disable();
          }
          this.recordReady.set(true);
        });
      }
    }
  }

  /**
   * Back / Cancel handler. Routes to the snapshot taken on mount so the
   * operator lands on the exact filter slice they came from. Bypasses the
   * form's own state — no validation, no dirty check, no submit.
   */
  protected onBack(): void {
    void this.router.navigateByUrl(this.listReturnUrl);
  }

  /**
   * Looks the typed holder DNI up. A returning holder prefills name and contact data and shows
   * what they already pay; an unknown DNI is a new holder. Errors other than 404 (e.g. 403 for a
   * self-service user, who cannot browse holders) just leave the fields as typed.
   */
  protected onHolderDniLookup(): void {
    const control = this.billing.controls.holderDni;
    const dni = control.value;
    if (dni === null || control.invalid) {
      this.holderLookup.set(null);
      return;
    }
    this.service.findHolder(dni).subscribe({
      next: (detail) => {
        this.billing.patchValue({
          holderFirstName: detail.holder.firstName,
          holderLastName: detail.holder.lastName,
          holderPhone: detail.holder.phone ?? '',
          holderEmail: detail.holder.email ?? '',
        });
        this.holderLookup.set({
          kind: 'existing',
          activeAffiliates: detail.activeAffiliates,
          monthlyTotal: detail.monthlyTotal,
        });
      },
      error: (err: { status?: number }) => {
        this.holderLookup.set(err.status === 404 ? { kind: 'new' } : null);
      },
    });
  }

  /** Spanish operator message for a non-insurable quote. */
  protected quoteReasonLabel(reason: string | null): string {
    switch (reason) {
      case 'ABOVE_MAX_ISSUE_AGE':
        return 'La edad supera el máximo de ingreso: no se puede afiliar.';
      case 'NO_AGE_BAND':
        return 'No hay una franja etaria para esa edad: no se puede afiliar.';
      default:
        return 'No asegurable.';
    }
  }

  protected formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 2,
    }).format(value);
  }

  /** `true` when nothing in any of the three sections changed (edit mode no-op). */
  protected pristine(): boolean {
    return this.personal.pristine && this.classification.pristine && this.billing.pristine;
  }

  protected onSubmit(): void {
    const formValid = this.personal.valid && this.classification.valid && this.billing.valid;
    if (!formValid || this.submitting() || !this.catalogsReady()) {
      this.personal.markAllAsTouched();
      this.classification.markAllAsTouched();
      this.billing.markAllAsTouched();
      return;
    }
    // Skip the no-op `PUT` when no step was touched (see brand-form.page.ts).
    if (this.mode === 'edit' && this.pristine()) {
      void this.router.navigateByUrl(this.listReturnUrl);
      return;
    }
    const personal = this.personal.getRawValue();
    const classification = this.classification.getRawValue();
    const billing = this.billing.getRawValue();
    const gender = this.findGender(classification.genderId);
    const relationship = this.findRelationship(classification.relationshipId);
    if (
      !gender ||
      !relationship ||
      !personal.dni ||
      !personal.birthDate ||
      !billing.holderDni ||
      !billing.enrolmentDate
    ) {
      return;
    }

    const request: AffiliateRequest = {
      firstName: personal.firstName.trim(),
      lastName: personal.lastName.trim(),
      dni: personal.dni,
      birthDate: toIsoDate(personal.birthDate),
      gender: { id: gender.id, name: gender.name },
      relationship: { id: relationship.id, name: relationship.name },
      holder: {
        dni: billing.holderDni,
        firstName: billing.holderFirstName.trim(),
        lastName: billing.holderLastName.trim(),
        ...(billing.holderPhone.trim() ? { phone: billing.holderPhone.trim() } : {}),
        ...(billing.holderEmail.trim() ? { email: billing.holderEmail.trim() } : {}),
      },
      healthTierCode: billing.healthTierCode,
      enrolmentDate: toIsoDate(billing.enrolmentDate),
    };

    this.submitting.set(true);
    this.errorMessage.set(null);
    const observable =
      this.mode === 'edit' && this.editDni !== null
        ? this.service.update(this.editDni, request)
        : this.service.create(request);

    // Edit mode is navigated optimistically: the service's `update()` tap patches
    // both `_list` and `_page` caches, so the listing already reflects the new
    // values by the time the operator lands on it. The snackbar reports the
    // server outcome — including failures, which arrive after the form is
    // already gone. Create stays synchronous (wait for response, navigate on
    // success) to avoid losing what the operator typed if the POST fails.
    const optimistic = this.mode === 'edit';
    if (optimistic) {
      void this.router.navigateByUrl(this.listReturnUrl);
    }

    observable.subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(
          this.mode === 'edit' ? 'Afiliado actualizado' : 'Afiliado creado',
          'Cerrar',
        );
        if (!optimistic) {
          void this.router.navigateByUrl(this.listReturnUrl);
        }
      },
      error: (err: { status?: number; error?: { detail?: string } }) => {
        this.submitting.set(false);
        const message = this.mapError(err.status ?? 0, err.error?.detail);
        if (optimistic) {
          // The form is no longer mounted; the snackbar is the only surviving
          // affordance to report the failure.
          this.snackBar.open(message, 'Cerrar');
        } else {
          this.errorMessage.set(message);
        }
      },
    });
  }

  private parseEditDni(): number | null {
    if (this.route.snapshot.data['mode'] !== 'edit') {
      return null;
    }
    const raw = this.route.snapshot.paramMap.get('dni');
    if (raw === null) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private patchFrom(affiliate: Affiliate): void {
    this.personal.patchValue({
      firstName: affiliate.firstName,
      lastName: affiliate.lastName,
      dni: affiliate.dni,
      birthDate: parseIsoDate(affiliate.birthDate),
    });
    this.classification.patchValue({
      genderId: affiliate.gender.id,
      relationshipId: affiliate.relationship.id,
    });
    // Legacy affiliates (enrolled before billing) have no holder or tier: the operator must
    // complete them on the first edit, which also prices the fee.
    if (affiliate.holder) {
      this.billing.patchValue({
        holderDni: affiliate.holder.dni,
        holderFirstName: affiliate.holder.firstName,
        holderLastName: affiliate.holder.lastName,
        holderPhone: affiliate.holder.phone ?? '',
        holderEmail: affiliate.holder.email ?? '',
      });
    }
    if (affiliate.healthTier) {
      this.billing.patchValue({ healthTierCode: affiliate.healthTier.code });
    }
    // Older backends do not send the enrolment date; the record creation day is what they used.
    this.billing.patchValue({
      enrolmentDate: parseIsoDate(affiliate.enrolmentDate ?? affiliate.startDate),
    });
    // DNI is the natural key — once saved we never change it.
    (this.personal.controls.dni as FormControl).disable();
  }

  private findGender(id: number | null): Gender | undefined {
    if (id === null) {
      return undefined;
    }
    return (this.genders() ?? []).find((g) => g.id === id);
  }

  private findRelationship(id: number | null): Relationship | undefined {
    if (id === null) {
      return undefined;
    }
    return (this.relationships() ?? []).find((r) => r.id === id);
  }

  private mapError(status: number, detail?: string): string {
    switch (status) {
      case 0:
        return 'No se pudo contactar al servidor.';
      case 400:
        return detail ?? 'Datos inválidos. Revisá el formulario.';
      case 409:
        // Duplicate DNI or a non-insurable applicant: the backend detail says which.
        return detail ?? 'Ya existe un afiliado con ese DNI.';
      case 403:
        return 'No tenés permiso para realizar esta acción.';
      default:
        return detail ?? 'Ocurrió un error inesperado. Probá de nuevo.';
    }
  }
}

/** Whole years between `birthDate` and `on` (attained age), the same rule the backend uses. */
function ageOn(birthDate: Date, on: Date): number {
  let age = on.getFullYear() - birthDate.getFullYear();
  const beforeBirthday =
    on.getMonth() < birthDate.getMonth() ||
    (on.getMonth() === birthDate.getMonth() && on.getDate() < birthDate.getDate());
  if (beforeBirthday) {
    age -= 1;
  }
  return age;
}

/** Converts a `Date` from the Material datepicker into the backend's request format. */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parses the service-normalised `yyyy-MM-dd` string back into a `Date` for the
 * datepicker. Returns `null` for malformed input rather than `Invalid Date` so the
 * Angular form does not get into a wedged state.
 */
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}
