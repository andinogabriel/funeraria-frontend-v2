import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  FormControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { CatalogsService } from '../../catalogs/catalogs.service';
import type { Gender, Relationship } from '../../catalogs/catalogs.types';
import { AffiliateService } from '../affiliate.service';
import type { AffiliateRequest } from '../affiliate.types';

/**
 * Single component for both create and edit because the form layout is identical and
 * the differences (submit method, page title, prefilled values) collapse to two
 * conditionals. The `mode` input is driven by the route: `/afiliados/nuevo` mounts
 * with `mode='create'`; `/afiliados/:dni/editar` mounts with `mode='edit'` and a `dni`
 * input bound by `withComponentInputBinding()` (configured at app bootstrap).
 *
 * <h3>Catalog selects</h3>
 *
 * Gender and relationship dropdowns read from the shared {@link CatalogsService}
 * cache. The form does not block on the catalogs — if the user opens the page before
 * the cache fills, the selects appear empty for a heartbeat and then populate; the
 * submit button is disabled until both catalogs resolve so we never POST a half-set
 * payload.
 */
@Component({
  selector: 'app-affiliate-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatDatepickerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './affiliate-form.page.html',
  styleUrl: './affiliate-form.page.scss',
})
export class AffiliateFormPage {
  /** Drives create vs. edit. Resolved by the routing table. */
  readonly mode = input.required<'create' | 'edit'>();

  /** Provided only in edit mode by the route segment. */
  readonly dni = input<string | undefined>(undefined);

  private readonly fb = inject(NonNullableFormBuilder);
  private readonly catalogs = inject(CatalogsService);
  private readonly service = inject(AffiliateService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly genders = this.catalogs.genders;
  protected readonly relationships = this.catalogs.relationships;

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly title = computed(() =>
    this.mode() === 'create' ? 'Nuevo afiliado' : 'Editar afiliado',
  );

  protected readonly catalogsReady = computed(
    () => this.genders() !== null && this.relationships() !== null,
  );

  /**
   * Upper bound for the birth-date picker. Computed once at construction; affiliates
   * cannot be in the future and a forward-dated record is always a typo.
   */
  protected readonly today = new Date();

  /**
   * Typed reactive form. `dni` is an integer; the control is typed as `number` and the
   * matching `<input type="number">` keeps the binding straightforward. `birthDate` is
   * typed as `Date | null` because the Material datepicker emits `Date` and the form
   * is reset to `null` after a successful submit — the service converts to ISO
   * `yyyy-MM-dd` at the boundary.
   */
  protected readonly form = this.fb.group({
    firstName: this.fb.control('', { validators: [Validators.required, Validators.maxLength(60)] }),
    lastName: this.fb.control('', { validators: [Validators.required, Validators.maxLength(60)] }),
    dni: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(1_000_000), Validators.max(99_999_999)],
    }),
    birthDate: this.fb.control<Date | null>(null, { validators: [Validators.required] }),
    genderId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
    relationshipId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
  });

  constructor() {
    // Load catalogs in parallel; the form selects bind to the resulting signals.
    forkJoin([this.catalogs.loadGenders(), this.catalogs.loadRelationships()]).subscribe();

    // If we're in edit mode, hydrate from the service cache. The list page loads on
    // mount, so when the user navigates from there to edit the affiliate is already in
    // memory; if a user deep-links to /afiliados/:dni/editar with a cold cache we kick
    // off a load.
    const editDni = this.computedEditDni();
    if (editDni !== null) {
      const cached = this.service.findByDni(editDni);
      if (cached) {
        this.patchFrom(cached);
      } else {
        this.service.loadActive().subscribe(() => {
          const fresh = this.service.findByDni(editDni);
          if (fresh) {
            this.patchFrom(fresh);
          } else {
            this.errorMessage.set('No se encontró el afiliado solicitado.');
            this.form.disable();
          }
        });
      }
    }
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting() || !this.catalogsReady()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const gender = this.findGender(value.genderId);
    const relationship = this.findRelationship(value.relationshipId);
    if (!gender || !relationship || !value.dni || !value.birthDate) {
      return;
    }

    const request: AffiliateRequest = {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      dni: value.dni,
      birthDate: toIsoDate(value.birthDate),
      gender: { id: gender.id, name: gender.name },
      relationship: { id: relationship.id, name: relationship.name },
    };

    this.submitting.set(true);
    this.errorMessage.set(null);
    const observable =
      this.mode() === 'edit' && this.computedEditDni() !== null
        ? this.service.update(this.computedEditDni() as number, request)
        : this.service.create(request);

    observable.subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(
          this.mode() === 'edit' ? 'Afiliado actualizado' : 'Afiliado creado',
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

  /**
   * Parses the route's `dni` input into a number. Centralised so every read of the
   * edit dni goes through one parse and one `NaN` guard.
   */
  private computedEditDni(): number | null {
    if (this.mode() !== 'edit') {
      return null;
    }
    const raw = this.dni();
    if (raw === undefined) {
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
    this.form.patchValue({
      firstName: affiliate.firstName,
      lastName: affiliate.lastName,
      dni: affiliate.dni,
      birthDate: parseIsoDate(affiliate.birthDate),
      genderId: affiliate.gender.id,
      relationshipId: affiliate.relationship.id,
    });
    // DNI is the natural key for an affiliate — once saved we never change it. The
    // backend enforces uniqueness on insert, and our route is keyed on it.
    (this.form.controls.dni as FormControl).disable();
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
  // Constructing with explicit Y/M/D avoids the UTC midnight quirk of `new Date(string)`.
  return new Date(Number(year), Number(month) - 1, Number(day));
}
