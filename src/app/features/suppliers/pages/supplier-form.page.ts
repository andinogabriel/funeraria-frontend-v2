import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { CatalogsService } from '../../catalogs/catalogs.service';
import { SupplierService } from '../supplier.service';
import type { Supplier, SupplierRequest } from '../supplier.types';

/**
 * Single component for both create + edit of a supplier. Mirrors the
 * affiliate / item / plan form pattern (typed reactive form, signal state, mode + edit-key
 * parsed from the route snapshot).
 *
 * <h3>NIF as the natural key</h3>
 *
 * The NIF (CUIT for AR, NIF for ES) is the supplier's stable identifier. The form lets the
 * operator pick it freely on create; on edit it is rendered read-only so the path variable
 * stays in sync with the row. Same pattern as `code` on items.
 *
 * <h3>Dynamic mobile numbers and addresses</h3>
 *
 * Both are `FormArray`s with an "Agregar" button to push an empty row and a trash icon to
 * remove one. Mobile numbers carry a single text field; addresses carry the same
 * province → city cascade used by the funeral form (cities lazy-load per-province from
 * `CatalogsService.loadCities`).
 *
 * <h3>Skip the no-op PUT</h3>
 *
 * In edit mode the submit button stays disabled until the operator dirties any control, and
 * `onSubmit` short-circuits to navigation if all sub-forms are pristine. Same as every
 * other CRUD form in the app.
 */
@Component({
  selector: 'app-supplier-form-page',
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
    MatTooltipModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './supplier-form.page.html',
  styleUrl: './supplier-form.page.scss',
})
export class SupplierFormPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(SupplierService);
  private readonly catalogs = inject(CatalogsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly mode: 'create' | 'edit' =
    this.route.snapshot.data['mode'] === 'edit' ? 'edit' : 'create';
  private readonly editNif: string | null = this.parseEditNif();

  protected readonly title = this.mode === 'create' ? 'Nuevo proveedor' : 'Editar proveedor';

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly provinces = this.catalogs.provinces;

  /** Cities loaded per-row when the operator picks a province. Keyed by row index. */
  protected readonly citiesByRow = signal<
    ReadonlyMap<number, readonly { id: number; name: string }[]>
  >(new Map());

  protected readonly form = this.fb.group({
    name: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    nif: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(40)],
    }),
    webPage: this.fb.control(''),
    email: this.fb.control('', {
      validators: [Validators.required, Validators.email, Validators.maxLength(150)],
    }),
    mobileNumbers: this.fb.array<ReturnType<SupplierFormPage['createMobileGroup']>>([]),
    addresses: this.fb.array<ReturnType<SupplierFormPage['createAddressGroup']>>([]),
  });

  protected get mobileNumbers(): FormArray<ReturnType<SupplierFormPage['createMobileGroup']>> {
    return this.form.controls.mobileNumbers;
  }

  protected get addresses(): FormArray<ReturnType<SupplierFormPage['createAddressGroup']>> {
    return this.form.controls.addresses;
  }

  constructor() {
    forkJoin([this.catalogs.loadProvinces(), this.service.loadAll()]).subscribe(() => {
      if (this.editNif !== null) {
        const cached = this.service.findByNif(this.editNif);
        if (cached) {
          this.patchFrom(cached);
        } else {
          this.errorMessage.set('No se encontró el proveedor solicitado.');
          this.form.disable();
        }
      }
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.mode === 'edit' && this.form.pristine) {
      void this.router.navigate(['/proveedores']);
      return;
    }

    const value = this.form.getRawValue();
    const request: SupplierRequest = {
      name: value.name.trim(),
      nif: value.nif.trim(),
      webPage: value.webPage.trim() || null,
      email: value.email.trim(),
      mobileNumbers: value.mobileNumbers
        .map((row) => row.mobileNumber.trim())
        .filter((number) => number.length > 0)
        .map((number) => ({ mobileNumber: number })),
      addresses: value.addresses
        .filter((row) => row.cityId !== null && row.streetName.trim().length > 0)
        .map((row) => ({
          streetName: row.streetName.trim(),
          blockStreet: row.blockStreet ?? undefined,
          apartment: row.apartment.trim() || undefined,
          flat: row.flat.trim() || undefined,
          city: { id: row.cityId as number },
        })),
    };

    this.submitting.set(true);
    this.errorMessage.set(null);
    const observable =
      this.mode === 'edit' && this.editNif !== null
        ? this.service.update(this.editNif, request)
        : this.service.create(request);

    observable.subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(
          this.mode === 'edit' ? 'Proveedor actualizado' : 'Proveedor creado',
          'Cerrar',
        );
        void this.router.navigate(['/proveedores']);
      },
      error: (err: { status?: number; error?: { detail?: string } }) => {
        this.submitting.set(false);
        this.errorMessage.set(this.mapError(err.status ?? 0, err.error?.detail));
      },
    });
  }

  protected onAddMobile(): void {
    this.mobileNumbers.push(this.createMobileGroup());
  }

  protected onRemoveMobile(index: number): void {
    this.mobileNumbers.removeAt(index);
    this.mobileNumbers.markAsDirty();
  }

  protected onAddAddress(): void {
    const group = this.createAddressGroup();
    this.addresses.push(group);
    this.wireCityCascade(this.addresses.length - 1, group);
  }

  protected onRemoveAddress(index: number): void {
    this.addresses.removeAt(index);
    // Reindex the city cache so the row indexes stay aligned with the FormArray.
    const next = new Map(this.citiesByRow());
    next.delete(index);
    this.citiesByRow.set(next);
    this.addresses.markAsDirty();
  }

  protected citiesForRow(index: number): readonly { id: number; name: string }[] | null {
    return this.citiesByRow().get(index) ?? null;
  }

  private createMobileGroup() {
    return this.fb.group({
      mobileNumber: this.fb.control('', {
        validators: [Validators.required, Validators.maxLength(40)],
      }),
    });
  }

  private createAddressGroup() {
    return this.fb.group({
      provinceId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
      cityId: this.fb.control<number | null>(null, { validators: [Validators.required] }),
      streetName: this.fb.control('', {
        validators: [Validators.required, Validators.maxLength(120)],
      }),
      blockStreet: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
      apartment: this.fb.control('', { validators: [Validators.maxLength(20)] }),
      flat: this.fb.control('', { validators: [Validators.maxLength(20)] }),
    });
  }

  /**
   * Subscribes to the row's province picker and lazy-loads its cities into the per-row map.
   * Picking a different province clears the city selection so we never ship an inconsistent
   * (province, city) pair. Uses `takeUntilDestroyed` so the subscription unwinds with the
   * component without us having to track each one manually.
   */
  private wireCityCascade(
    index: number,
    group: ReturnType<SupplierFormPage['createAddressGroup']>,
  ): void {
    group.controls.provinceId.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((provinceId) => {
        const next = new Map(this.citiesByRow());
        if (provinceId === null) {
          next.delete(index);
          this.citiesByRow.set(next);
          group.controls.cityId.setValue(null, { emitEvent: false });
          return;
        }
        group.controls.cityId.setValue(null, { emitEvent: false });
        this.catalogs.loadCities(provinceId).subscribe((list) => {
          const refreshed = new Map(this.citiesByRow());
          refreshed.set(index, list);
          this.citiesByRow.set(refreshed);
        });
      });
  }

  private parseEditNif(): string | null {
    if (this.route.snapshot.data['mode'] !== 'edit') {
      return null;
    }
    return this.route.snapshot.paramMap.get('nif');
  }

  private patchFrom(supplier: Supplier): void {
    this.form.patchValue({
      name: supplier.name,
      nif: supplier.nif,
      webPage: supplier.webPage ?? '',
      email: supplier.email,
    });
    // NIF is the natural key; locked once persisted.
    this.form.controls.nif.disable();

    this.mobileNumbers.clear();
    for (const mobile of supplier.mobileNumbers) {
      const group = this.createMobileGroup();
      group.patchValue({ mobileNumber: mobile.mobileNumber });
      this.mobileNumbers.push(group);
    }

    this.addresses.clear();
    supplier.addresses.forEach((address, index) => {
      const group = this.createAddressGroup();
      const provinceId = ((address.city as { province?: { id?: number } } | undefined)?.province
        ?.id ?? null) as number | null;
      group.patchValue({
        provinceId,
        cityId: address.city?.id ?? null,
        streetName: address.streetName ?? '',
        blockStreet: address.blockStreet ?? null,
        apartment: address.apartment ?? '',
        flat: address.flat ?? '',
      });
      this.addresses.push(group);
      this.wireCityCascade(index, group);
      if (provinceId !== null) {
        this.catalogs.loadCities(provinceId).subscribe((list) => {
          const refreshed = new Map(this.citiesByRow());
          refreshed.set(index, list);
          this.citiesByRow.set(refreshed);
        });
      }
    });
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
        return detail ?? 'Ya existe un proveedor con ese NIF.';
      default:
        return detail ?? 'Ocurrió un error inesperado. Probá de nuevo.';
    }
  }
}
