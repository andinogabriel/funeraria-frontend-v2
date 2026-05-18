import { CurrencyPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
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
import { ItemService } from '../../items/item.service';
import { SupplierService } from '../../suppliers/supplier.service';
import { IncomeService } from '../income.service';
import type { Income, IncomeDetail, IncomeRequest } from '../income.types';

/**
 * Single component for both create and edit of an income (compra). Mirrors the plan / funeral
 * form structure: typed reactive form, signal state, mode + edit key from the route snapshot.
 *
 * <h3>Detail FormArray</h3>
 *
 * The line-item block is a `FormArray` with an "Agregar item" button to push a fresh row and a
 * trash icon to remove one. Each row has an item picker (catalog dropdown), a quantity field,
 * a purchase price and a sale price. The backend's `IncomeRequestDto` wants the full
 * `ItemRequestDto` shape, so on submit we resolve the row's item code back against the cached
 * catalog to ship the {id, name, code, price, ...} triple.
 *
 * <h3>Supplier picker</h3>
 *
 * Optional — admin can register receipts that don't have a supplier on file (yet). When
 * provided, the form sends only the NIF + name + email; the backend resolves the row.
 *
 * <h3>Skip the no-op PUT</h3>
 *
 * Same pristine-edit short-circuit as the other forms: if no control was dirtied we just
 * navigate back without hitting the server.
 */
@Component({
  selector: 'app-income-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CurrencyPipe,
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
  templateUrl: './income-form.page.html',
  styleUrl: './income-form.page.scss',
})
export class IncomeFormPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(IncomeService);
  private readonly supplierService = inject(SupplierService);
  private readonly itemService = inject(ItemService);
  private readonly catalogs = inject(CatalogsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly mode: 'create' | 'edit' =
    this.route.snapshot.data['mode'] === 'edit' ? 'edit' : 'create';
  private readonly editReceiptNumber: string | null = this.parseEditReceiptNumber();

  protected readonly title = this.mode === 'create' ? 'Nuevo ingreso' : 'Editar ingreso';

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly suppliers = this.supplierService.list;
  protected readonly items = this.itemService.list;
  protected readonly receiptTypes = this.catalogs.receiptTypes;

  protected readonly catalogsReady = computed(
    () => this.suppliers() !== null && this.items() !== null && this.receiptTypes() !== null,
  );

  protected readonly form = this.fb.group({
    receiptNumber: this.fb.control<number | null>(null),
    receiptSeries: this.fb.control<number | null>(null),
    receiptTypeId: this.fb.control<number | null>(null),
    supplierNif: this.fb.control<string | null>(null),
    tax: this.fb.control<number | null>(21, {
      validators: [Validators.required, Validators.min(0), Validators.max(100)],
    }),
    details: this.fb.array<ReturnType<IncomeFormPage['createDetailGroup']>>([]),
  });

  protected get details(): FormArray<ReturnType<IncomeFormPage['createDetailGroup']>> {
    return this.form.controls.details;
  }

  /**
   * Live preview of the total amount — `sum(qty × purchasePrice) × (1 + tax / 100)`. Pure
   * computed signal so the operator sees the figure update as they type. The backend
   * computes the canonical figure on save; this is just for the UI.
   */
  protected readonly previewTotal = computed(() => {
    const tax = this.form.controls.tax.value ?? 0;
    let subtotal = 0;
    for (const row of this.details.controls) {
      const qty = row.controls.quantity.value ?? 0;
      const price = row.controls.purchasePrice.value ?? 0;
      subtotal += qty * price;
    }
    return subtotal * (1 + tax / 100);
  });

  constructor() {
    forkJoin([
      this.supplierService.loadAll(),
      this.itemService.loadAll(),
      this.catalogs.loadReceiptTypes(),
    ]).subscribe(() => {
      if (this.editReceiptNumber !== null) {
        this.service.findByReceiptNumber(this.editReceiptNumber).subscribe({
          next: (income) => this.patchFrom(income),
          error: () => {
            this.errorMessage.set('No se encontró el ingreso solicitado.');
            this.form.disable();
          },
        });
      }
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting() || !this.catalogsReady()) {
      this.form.markAllAsTouched();
      return;
    }
    if (this.mode === 'edit' && this.form.pristine) {
      void this.router.navigate(['/ingresos']);
      return;
    }
    if (this.details.length === 0) {
      this.errorMessage.set('Sumá al menos un item al ingreso.');
      return;
    }

    const value = this.form.getRawValue();

    const itemCatalog = this.items() ?? [];
    const incomeDetails: IncomeDetail[] = [];
    for (const row of value.details) {
      const catalogEntry = itemCatalog.find((entry) => entry.code === row.itemCode);
      if (!catalogEntry || row.quantity === null) {
        continue;
      }
      incomeDetails.push({
        quantity: row.quantity,
        purchasePrice: row.purchasePrice ?? 0,
        salePrice: row.salePrice ?? 0,
        item: {
          id: catalogEntry.id,
          name: catalogEntry.name,
          code: catalogEntry.code,
          description: catalogEntry.description ?? null,
          price: catalogEntry.price,
        },
      });
    }

    if (incomeDetails.length === 0) {
      this.errorMessage.set('Las filas de detalle no son válidas.');
      return;
    }

    const supplier =
      value.supplierNif !== null
        ? ((this.suppliers() ?? []).find((s) => s.nif === value.supplierNif) ?? null)
        : null;
    const receiptType =
      value.receiptTypeId !== null
        ? ((this.receiptTypes() ?? []).find((r) => r.id === value.receiptTypeId) ?? null)
        : null;

    const request: IncomeRequest = {
      receiptNumber: value.receiptNumber,
      receiptSeries: value.receiptSeries,
      tax: value.tax ?? 21,
      receiptType: receiptType ? { id: receiptType.id, name: receiptType.name } : null,
      supplier: supplier
        ? {
            name: supplier.name,
            nif: supplier.nif,
            webPage: supplier.webPage,
            email: supplier.email,
            mobileNumbers: supplier.mobileNumbers,
            addresses: [],
          }
        : null,
      incomeDetails,
    };

    this.submitting.set(true);
    this.errorMessage.set(null);
    const observable =
      this.mode === 'edit' && this.editReceiptNumber !== null
        ? this.service.update(this.editReceiptNumber, request)
        : this.service.create(request);

    observable.subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(
          this.mode === 'edit' ? 'Ingreso actualizado' : 'Ingreso creado',
          'Cerrar',
        );
        void this.router.navigate(['/ingresos']);
      },
      error: (err: { status?: number; error?: { detail?: string } }) => {
        this.submitting.set(false);
        this.errorMessage.set(this.mapError(err.status ?? 0, err.error?.detail));
      },
    });
  }

  protected onAddDetail(): void {
    this.details.push(this.createDetailGroup());
  }

  protected onRemoveDetail(index: number): void {
    this.details.removeAt(index);
    this.details.markAsDirty();
  }

  private createDetailGroup(seed?: IncomeDetail) {
    return this.fb.group({
      itemCode: this.fb.control<string | null>(seed?.item.code ?? null, {
        validators: [Validators.required],
      }),
      quantity: this.fb.control<number | null>(seed?.quantity ?? 1, {
        validators: [Validators.required, Validators.min(1)],
      }),
      purchasePrice: this.fb.control<number | null>(seed?.purchasePrice ?? null, {
        validators: [Validators.required, Validators.min(0)],
      }),
      salePrice: this.fb.control<number | null>(seed?.salePrice ?? null, {
        validators: [Validators.required, Validators.min(0)],
      }),
    });
  }

  private parseEditReceiptNumber(): string | null {
    if (this.route.snapshot.data['mode'] !== 'edit') {
      return null;
    }
    return this.route.snapshot.paramMap.get('receiptNumber');
  }

  private patchFrom(income: Income): void {
    this.form.patchValue({
      receiptNumber: income.receiptNumber ? Number(income.receiptNumber) : null,
      receiptSeries: income.receiptSeries ? Number(income.receiptSeries) : null,
      receiptTypeId: income.receiptType?.id ?? null,
      supplierNif: income.supplier?.nif ?? null,
      tax: income.tax,
    });

    this.details.clear();
    for (const detail of income.incomeDetails) {
      this.details.push(this.createDetailGroup(detail));
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
        return detail ?? 'Ya existe un ingreso con ese recibo.';
      default:
        return detail ?? 'Ocurrió un error inesperado. Probá de nuevo.';
    }
  }
}
