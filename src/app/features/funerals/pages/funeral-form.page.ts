import { BreakpointObserver, Breakpoints } from '@angular/cdk/layout';
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
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

import { AffiliateService } from '../../affiliates/affiliate.service';
import { CatalogsService } from '../../catalogs/catalogs.service';
import { ItemService } from '../../items/item.service';
import { PlanService } from '../../plans/plan.service';
import { FuneralService } from '../funeral.service';
import type { DeceasedRequest, Funeral, FuneralRequest, ItemPlanRequest } from '../funeral.types';

/**
 * Single component for both create and edit of a funeral service.
 *
 * <h3>Responsive layout</h3>
 *
 * - Desktop: a single card with three sections (Servicio / Fallecido /
 *   Plan + items) stacked behind dividers.
 * - Mobile: a 3-step wizard backed by independent `FormGroup`s so the
 *   linear stepper can block advancement until the current step is valid.
 *   Same horizontal `mat-stepper` chrome (numbered indicators via
 *   `matStepperIcon`) used by the affiliate / item forms.
 *
 * <h3>"Es afiliado" autocomplete</h3>
 *
 * The Fallecido section starts with a "Es afiliado" checkbox. When the
 * operator turns it on, a picker of active affiliates appears; selecting an
 * affiliate copies its `firstName` / `lastName` / `dni` / `birthDate` /
 * `gender` / `relationship` into the form and disables the four identity
 * fields so they cannot drift from the source record. Turning the checkbox
 * back off re-enables the fields and leaves the values for the operator to
 * adjust. `deceasedUser` is sent as `null` in this first cut — operators
 * who need to bind the deceased to the user who owns the affiliate policy
 * have to do it on the backend until we ship the user picker.
 *
 * <h3>Plan picker with editable quantities</h3>
 *
 * Picking a plan loads its `itemsPlan` into a `FormArray` of `{ code, name,
 * quantity }` rows. The operator can adjust each quantity for this
 * specific service without touching the original plan record. Items
 * themselves are not addable / removable here — that lives on the plan
 * form. The submission re-encodes the rows into the `PlanRequest`
 * structure the backend expects.
 *
 * <h3>placeOfDeath</h3>
 *
 * Always sent as `null` in v1. The backend accepts the field but wiring a
 * city picker would inflate the form past what operators have asked for so
 * far. Documented here so the next maintainer knows it is a deliberate gap
 * rather than an oversight.
 */
@Component({
  selector: 'app-funeral-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
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
  templateUrl: './funeral-form.page.html',
  styleUrl: './funeral-form.page.scss',
})
export class FuneralFormPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(FuneralService);
  private readonly planService = inject(PlanService);
  private readonly itemService = inject(ItemService);
  private readonly affiliateService = inject(AffiliateService);
  private readonly catalogs = inject(CatalogsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly breakpointObserver = inject(BreakpointObserver);

  protected readonly mode: 'create' | 'edit' =
    this.route.snapshot.data['mode'] === 'edit' ? 'edit' : 'create';
  private readonly editId: number | null = this.parseEditId();

  protected readonly title = this.mode === 'create' ? 'Nuevo servicio' : 'Editar servicio';

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /* ---------------------------- Catalog signals --------------------------- */

  protected readonly genders = this.catalogs.genders;
  protected readonly relationships = this.catalogs.relationships;
  protected readonly deathCauses = this.catalogs.deathCauses;
  protected readonly receiptTypes = this.catalogs.receiptTypes;
  protected readonly plans = this.planService.list;
  protected readonly affiliates = this.affiliateService.list;

  protected readonly catalogsReady = computed(
    () =>
      this.genders() !== null &&
      this.relationships() !== null &&
      this.deathCauses() !== null &&
      this.receiptTypes() !== null &&
      this.plans() !== null &&
      this.affiliates() !== null,
  );

  protected readonly today = new Date();

  /* ----------------------------- Step 1: Servicio ----------------------------- */

  protected readonly servicio = this.fb.group({
    funeralDate: this.fb.control<Date | null>(null, { validators: [Validators.required] }),
    /** `HH:mm` 24h string. Combined with `funeralDate` on submit. */
    funeralTime: this.fb.control<string>('09:00', {
      validators: [Validators.required, Validators.pattern(/^([01]\d|2[0-3]):[0-5]\d$/)],
    }),
    receiptTypeId: this.fb.control<number | null>(null),
    receiptNumber: this.fb.control('', { validators: [Validators.maxLength(50)] }),
    receiptSeries: this.fb.control('', { validators: [Validators.maxLength(50)] }),
    tax: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
  });

  /* ----------------------------- Step 2: Fallecido ---------------------------- */

  protected readonly fallecido = this.fb.group({
    isAffiliated: this.fb.control(false),
    /** Picker value — null when no affiliate is selected (or `isAffiliated` is off). */
    affiliateDni: this.fb.control<number | null>(null),
    firstName: this.fb.control('', { validators: [Validators.required, Validators.maxLength(60)] }),
    lastName: this.fb.control('', { validators: [Validators.required, Validators.maxLength(60)] }),
    dni: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(1_000_000), Validators.max(99_999_999)],
    }),
    birthDate: this.fb.control<Date | null>(null, { validators: [Validators.required] }),
    deathDate: this.fb.control<Date | null>(null, { validators: [Validators.required] }),
    genderId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
    deceasedRelationshipId: this.fb.control<number | null>(null, {
      validators: [Validators.required],
    }),
    deathCauseId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
  });

  /* ----------------------------- Step 3: Plan + items ------------------------- */

  protected readonly planSelection = this.fb.group({
    planId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
    items: this.fb.array<ReturnType<FuneralFormPage['createItemRow']>>([]),
  });

  protected get itemRows(): FormArray<ReturnType<FuneralFormPage['createItemRow']>> {
    return this.planSelection.controls.items;
  }

  /* ----------------------------- Reactive helpers ----------------------------- */

  protected readonly isHandset = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /** Reactive snapshot of the affiliate-toggle so the template can react with `@if`. */
  protected readonly isAffiliated = toSignal(this.fallecido.controls.isAffiliated.valueChanges, {
    initialValue: this.fallecido.controls.isAffiliated.value,
  });

  /** Reactive snapshot of the affiliate-DNI picker — feeds the autopopulate effect. */
  private readonly selectedAffiliateDni = toSignal(
    this.fallecido.controls.affiliateDni.valueChanges,
    { initialValue: this.fallecido.controls.affiliateDni.value },
  );

  /** Reactive snapshot of the plan picker — feeds the items-rebuild effect. */
  private readonly selectedPlanId = toSignal(this.planSelection.controls.planId.valueChanges, {
    initialValue: this.planSelection.controls.planId.value,
  });

  constructor() {
    // Load catalogs + plans + active affiliates in parallel; once everything
    // resolves we hydrate the form in edit mode. The list signals back the
    // catalog-bound selects in the template so this is the only place that
    // sequencing matters.
    forkJoin([
      this.catalogs.loadGenders(),
      this.catalogs.loadRelationships(),
      this.catalogs.loadDeathCauses(),
      this.catalogs.loadReceiptTypes(),
      this.planService.loadAll(),
      this.itemService.loadAll(),
      this.affiliateService.loadActive(),
      this.service.loadAll(),
    ]).subscribe(() => {
      if (this.editId !== null) {
        const cached = this.service.findById(this.editId);
        if (cached) {
          this.patchFrom(cached);
        } else {
          this.errorMessage.set('No se encontró el servicio solicitado.');
          this.servicio.disable();
          this.fallecido.disable();
          this.planSelection.disable();
        }
      }
    });

    // Autopopulate the deceased identity fields when the operator picks an
    // affiliate from the picker. The effect re-runs whenever the picker DNI
    // changes; we skip it when the toggle is off (the picker can still hold
    // a stale value briefly) and when no affiliate matches the DNI.
    effect(() => {
      const dni = this.selectedAffiliateDni();
      if (!this.isAffiliated() || dni === null) {
        return;
      }
      const affiliate = (this.affiliates() ?? []).find((a) => a.dni === dni);
      if (!affiliate) {
        return;
      }
      this.fallecido.patchValue(
        {
          firstName: affiliate.firstName,
          lastName: affiliate.lastName,
          dni: affiliate.dni,
          birthDate: parseIsoDate(affiliate.birthDate),
          genderId: affiliate.gender.id,
          deceasedRelationshipId: affiliate.relationship.id,
        },
        { emitEvent: false },
      );
    });

    // When the affiliate toggle is turned off, clear the picker so a future
    // turn-back-on starts from a clean slate.
    effect(() => {
      if (!this.isAffiliated()) {
        this.fallecido.controls.affiliateDni.setValue(null, { emitEvent: false });
      }
    });

    // Rebuild the items FormArray whenever a different plan is picked. Each
    // row carries the catalog item's code + name (for display) and an editable
    // quantity, validated 1..200 per backend's `@Max(200)`.
    effect(() => {
      const planId = this.selectedPlanId();
      if (planId === null) {
        this.itemRows.clear();
        return;
      }
      const plan = (this.plans() ?? []).find((p) => p.id === planId);
      if (!plan) {
        return;
      }
      this.itemRows.clear();
      for (const row of plan.itemsPlan) {
        this.itemRows.push(this.createItemRow(row.item.code, row.item.name, row.quantity));
      }
    });
  }

  protected onSubmit(): void {
    const valid =
      this.servicio.valid &&
      this.fallecido.valid &&
      this.planSelection.valid &&
      this.itemRows.valid;
    if (!valid || this.submitting() || !this.catalogsReady()) {
      this.servicio.markAllAsTouched();
      this.fallecido.markAllAsTouched();
      this.planSelection.markAllAsTouched();
      return;
    }
    if (
      this.mode === 'edit' &&
      this.servicio.pristine &&
      this.fallecido.pristine &&
      this.planSelection.pristine
    ) {
      void this.router.navigate(['/servicios']);
      return;
    }

    const servicio = this.servicio.getRawValue();
    const fallecido = this.fallecido.getRawValue();
    const planSelection = this.planSelection.getRawValue();

    if (
      servicio.funeralDate === null ||
      fallecido.birthDate === null ||
      fallecido.deathDate === null ||
      fallecido.dni === null ||
      fallecido.genderId === null ||
      fallecido.deceasedRelationshipId === null ||
      fallecido.deathCauseId === null ||
      planSelection.planId === null
    ) {
      return;
    }

    const plan = (this.plans() ?? []).find((p) => p.id === planSelection.planId);
    if (!plan) {
      this.errorMessage.set('El plan seleccionado ya no está disponible.');
      return;
    }
    const gender = (this.genders() ?? []).find((g) => g.id === fallecido.genderId);
    const relationship = (this.relationships() ?? []).find(
      (r) => r.id === fallecido.deceasedRelationshipId,
    );
    const deathCause = (this.deathCauses() ?? []).find((d) => d.id === fallecido.deathCauseId);
    const receiptType =
      servicio.receiptTypeId !== null
        ? ((this.receiptTypes() ?? []).find((r) => r.id === servicio.receiptTypeId) ?? null)
        : null;
    if (!gender || !relationship || !deathCause) {
      return;
    }

    // Resolve each row's catalog id from the items service so the backend's
    // `ItemRequestPlanDto` carries the full {id, name, code} triple. The lookup
    // is by `code` (the natural key the operator can recognise across surfaces)
    // and falls back to `0` if the cache is stale — the backend still resolves
    // by name + code in that case, but we surface a friendly error first if
    // the item went missing entirely.
    const itemCatalog = this.itemService.list() ?? [];
    const itemsPlan: readonly ItemPlanRequest[] = planSelection.items.map((row) => {
      const catalogEntry = itemCatalog.find((entry) => entry.code === row.code);
      return {
        item: {
          id: catalogEntry?.id ?? 0,
          name: catalogEntry?.name ?? row.name,
          code: row.code,
        },
        quantity: row.quantity ?? 0,
      };
    });

    const deceased: DeceasedRequest = {
      firstName: fallecido.firstName.trim(),
      lastName: fallecido.lastName.trim(),
      dni: fallecido.dni,
      birthDate: toIsoDate(fallecido.birthDate),
      deathDate: toIsoDate(fallecido.deathDate),
      placeOfDeath: null,
      gender: { id: gender.id, name: gender.name },
      deceasedRelationship: { id: relationship.id, name: relationship.name },
      deathCause: { id: deathCause.id, name: deathCause.name },
      deceasedUser: null,
    };

    const request: FuneralRequest = {
      funeralDate: combineDateAndTime(servicio.funeralDate, servicio.funeralTime),
      receiptNumber: servicio.receiptNumber.trim() || null,
      receiptSeries: servicio.receiptSeries.trim() || null,
      tax: servicio.tax,
      receiptType: receiptType ? { id: receiptType.id, name: receiptType.name } : null,
      deceased,
      plan: {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        profitPercentage: plan.profitPercentage,
        itemsPlan,
      },
    };

    this.submitting.set(true);
    this.errorMessage.set(null);
    const observable =
      this.mode === 'edit' && this.editId !== null
        ? this.service.update(this.editId, request)
        : this.service.create(request);

    observable.subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(
          this.mode === 'edit' ? 'Servicio actualizado' : 'Servicio creado',
          'Cerrar',
        );
        void this.router.navigate(['/servicios']);
      },
      error: (err: { status?: number; error?: { detail?: string } }) => {
        this.submitting.set(false);
        this.errorMessage.set(this.mapError(err.status ?? 0, err.error?.detail));
      },
    });
  }

  private createItemRow(code: string, name: string, quantity: number) {
    return this.fb.group({
      code: this.fb.control<string>(code),
      name: this.fb.control<string>(name),
      quantity: this.fb.control<number | null>(quantity, {
        validators: [Validators.required, Validators.min(1), Validators.max(200)],
      }),
    });
  }

  private parseEditId(): number | null {
    if (this.route.snapshot.data['mode'] !== 'edit') {
      return null;
    }
    const raw = this.route.snapshot.paramMap.get('id');
    if (raw === null) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private patchFrom(funeral: Funeral): void {
    const funeralDate = new Date(funeral.funeralDate);
    const pad = (n: number): string => String(n).padStart(2, '0');
    this.servicio.patchValue({
      funeralDate,
      funeralTime: `${pad(funeralDate.getHours())}:${pad(funeralDate.getMinutes())}`,
      receiptTypeId: funeral.receiptType?.id ?? null,
      receiptNumber: funeral.receiptNumber ?? '',
      receiptSeries: funeral.receiptSeries ?? '',
      tax: funeral.tax,
    });

    const isAffiliated = funeral.deceased.affiliated;
    this.fallecido.patchValue({
      isAffiliated,
      affiliateDni: isAffiliated ? funeral.deceased.dni : null,
      firstName: funeral.deceased.firstName,
      lastName: funeral.deceased.lastName,
      dni: funeral.deceased.dni,
      birthDate: parseIsoDate(funeral.deceased.birthDate),
      deathDate: parseIsoDate(funeral.deceased.deathDate),
      genderId: funeral.deceased.gender.id,
      deceasedRelationshipId: funeral.deceased.deceasedRelationship.id,
      deathCauseId: funeral.deceased.deathCause.id,
    });

    this.planSelection.patchValue({ planId: funeral.plan.id });
    this.itemRows.clear();
    for (const row of funeral.plan.itemsPlan) {
      this.itemRows.push(this.createItemRow(row.item.code, row.item.name, row.quantity));
    }
  }

  private mapError(status: number, detail?: string): string {
    switch (status) {
      case 0:
        return 'No se pudo contactar al servidor.';
      case 400:
        return detail ?? 'Datos inválidos. Revisá el formulario.';
      case 403:
        return 'No tenés permiso para realizar esta acción.';
      case 409:
        return detail ?? 'Ya existe un servicio con esos datos.';
      default:
        return detail ?? 'Ocurrió un error inesperado. Probá de nuevo.';
    }
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Helpers                                   */
/* -------------------------------------------------------------------------- */

/** Converts a Material datepicker `Date` to ISO `yyyy-MM-dd`. */
function toIsoDate(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Combines a calendar `Date` and an `HH:mm` string into an ISO `yyyy-MM-ddTHH:mm:ss`. */
function combineDateAndTime(date: Date, time: string): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  const [hour, minute] = time.split(':').map(Number);
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T` +
    `${pad(hour)}:${pad(minute)}:00`
  );
}

/**
 * Parses ISO `yyyy-MM-dd` back into a calendar `Date`. Returns `null` for
 * malformed input so the form does not wedge with `Invalid Date`.
 */
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return null;
  }
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}
