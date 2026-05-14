import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';

import { BrandService } from '../../brands/brand.service';
import { CategoryService } from '../../categories/category.service';
import { ItemService } from '../item.service';
import type { Item, ItemRequest } from '../item.types';

/**
 * Single component for both create + edit of items. The form is broken into
 * three logical sections (datos, dimensiones, clasificación) inside a single
 * card — same pattern as the affiliate form on desktop.
 *
 * `brand` and `category` are required-ish at the operator level (the catalog
 * relies on them for filtering and reporting) but the backend marks them as
 * nullable; the form mirrors that by allowing empty selects.
 */
@Component({
  selector: 'app-item-form-page',
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
    RouterLink,
  ],
  templateUrl: './item-form.page.html',
  styleUrl: './item-form.page.scss',
})
export class ItemFormPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(ItemService);
  private readonly brandService = inject(BrandService);
  private readonly categoryService = inject(CategoryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly mode: 'create' | 'edit' =
    this.route.snapshot.data['mode'] === 'edit' ? 'edit' : 'create';
  private readonly editCode: string | null = this.parseEditCode();

  protected readonly title = this.mode === 'create' ? 'Nuevo item' : 'Editar item';

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly brands = this.brandService.list;
  protected readonly categories = this.categoryService.list;

  protected readonly catalogsReady = computed(
    () => this.brands() !== null && this.categories() !== null,
  );

  protected readonly form = this.fb.group({
    name: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    description: this.fb.control(''),
    code: this.fb.control('', { validators: [Validators.required, Validators.maxLength(60)] }),
    price: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(0)],
    }),
    itemLength: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
    itemHeight: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
    itemWidth: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
    brandId: this.fb.control<number | null>(null),
    categoryId: this.fb.control<number | null>(null),
  });

  constructor() {
    // Brands + categories drive the selects; items reloads so `findByCode` can
    // hydrate the form in edit mode.
    forkJoin([
      this.brandService.loadAll(),
      this.categoryService.loadAll(),
      this.service.loadAll(),
    ]).subscribe(() => {
      if (this.editCode !== null) {
        const cached = this.service.findByCode(this.editCode);
        if (cached) {
          this.patchFrom(cached);
        } else {
          this.errorMessage.set('No se encontró el item solicitado.');
          this.form.disable();
        }
      }
    });
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting() || !this.catalogsReady()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    if (value.price === null) {
      return;
    }

    const brand =
      value.brandId !== null ? (this.brands()?.find((b) => b.id === value.brandId) ?? null) : null;
    const category =
      value.categoryId !== null
        ? (this.categories()?.find((c) => c.id === value.categoryId) ?? null)
        : null;

    const request: ItemRequest = {
      name: value.name.trim(),
      description: value.description.trim() || null,
      code: value.code.trim(),
      price: value.price,
      itemLength: value.itemLength,
      itemHeight: value.itemHeight,
      itemWidth: value.itemWidth,
      brand,
      category,
    };

    this.submitting.set(true);
    this.errorMessage.set(null);
    const observable =
      this.mode === 'edit' && this.editCode !== null
        ? this.service.update(this.editCode, request)
        : this.service.create(request);

    observable.subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(this.mode === 'edit' ? 'Item actualizado' : 'Item creado', 'OK', {
          duration: 3000,
        });
        void this.router.navigate(['/items']);
      },
      error: (err: { status?: number; error?: { detail?: string } }) => {
        this.submitting.set(false);
        this.errorMessage.set(this.mapError(err.status ?? 0, err.error?.detail));
      },
    });
  }

  private parseEditCode(): string | null {
    if (this.route.snapshot.data['mode'] !== 'edit') return null;
    return this.route.snapshot.paramMap.get('code');
  }

  private patchFrom(item: Item): void {
    this.form.patchValue({
      name: item.name,
      description: item.description ?? '',
      code: item.code,
      price: item.price,
      itemLength: item.itemLength,
      itemHeight: item.itemHeight,
      itemWidth: item.itemWidth,
      brandId: item.brand?.id ?? null,
      categoryId: item.category?.id ?? null,
    });
    // Code is the natural key — once saved we never let the operator change it.
    this.form.controls.code.disable();
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
        return 'Ya existe un item con ese código.';
      default:
        return detail ?? 'Ocurrió un error inesperado. Probá de nuevo.';
    }
  }
}
