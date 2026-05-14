import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';

import { CatalogsService } from '../../catalogs/catalogs.service';
import type { Gender, Relationship } from '../../catalogs/catalogs.types';
import { AffiliateService } from '../affiliate.service';
import type { AffiliateRequest } from '../affiliate.types';

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
 */
@Component({
  selector: 'app-affiliate-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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
    RouterLink,
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

  /** Drives create vs. edit. Read from the static route data at construction time. */
  protected readonly mode: 'create' | 'edit' =
    this.route.snapshot.data['mode'] === 'edit' ? 'edit' : 'create';

  /** DNI of the affiliate being edited (or `null` in create mode / malformed segment). */
  private readonly editDni: number | null = this.parseEditDni();

  protected readonly genders = this.catalogs.genders;
  protected readonly relationships = this.catalogs.relationships;

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly title = this.mode === 'create' ? 'Nuevo afiliado' : 'Editar afiliado';

  protected readonly catalogsReady = computed(
    () => this.genders() !== null && this.relationships() !== null,
  );

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

    // If we're in edit mode, hydrate from the service cache. If the cache is cold
    // (deep-link to /afiliados/:dni/editar with no prior list visit), we kick off a
    // load and try again.
    if (this.editDni !== null) {
      const cached = this.service.findByDni(this.editDni);
      if (cached) {
        this.patchFrom(cached);
      } else {
        this.service.loadActive().subscribe(() => {
          const fresh = this.service.findByDni(this.editDni as number);
          if (fresh) {
            this.patchFrom(fresh);
          } else {
            this.errorMessage.set('No se encontró el afiliado solicitado.');
            this.personal.disable();
            this.classification.disable();
          }
        });
      }
    }
  }

  protected onSubmit(): void {
    const formValid = this.personal.valid && this.classification.valid;
    if (!formValid || this.submitting() || !this.catalogsReady()) {
      this.personal.markAllAsTouched();
      this.classification.markAllAsTouched();
      return;
    }
    const personal = this.personal.getRawValue();
    const classification = this.classification.getRawValue();
    const gender = this.findGender(classification.genderId);
    const relationship = this.findRelationship(classification.relationshipId);
    if (!gender || !relationship || !personal.dni || !personal.birthDate) {
      return;
    }

    const request: AffiliateRequest = {
      firstName: personal.firstName.trim(),
      lastName: personal.lastName.trim(),
      dni: personal.dni,
      birthDate: toIsoDate(personal.birthDate),
      gender: { id: gender.id, name: gender.name },
      relationship: { id: relationship.id, name: relationship.name },
    };

    this.submitting.set(true);
    this.errorMessage.set(null);
    const observable =
      this.mode === 'edit' && this.editDni !== null
        ? this.service.update(this.editDni, request)
        : this.service.create(request);

    observable.subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(
          this.mode === 'edit' ? 'Afiliado actualizado' : 'Afiliado creado',
          'OK',
          { duration: 3000 },
        );
        void this.router.navigate(['/afiliados']);
      },
      error: (err: { status?: number; error?: { detail?: string } }) => {
        this.submitting.set(false);
        this.errorMessage.set(this.mapError(err.status ?? 0, err.error?.detail));
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

  private patchFrom(affiliate: {
    firstName: string;
    lastName: string;
    dni: number;
    birthDate: string;
    gender: Gender;
    relationship: Relationship;
  }): void {
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
        return 'Ya existe un afiliado con ese DNI.';
      case 403:
        return 'No tenés permiso para realizar esta acción.';
      default:
        return detail ?? 'Ocurrió un error inesperado. Probá de nuevo.';
    }
  }
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
