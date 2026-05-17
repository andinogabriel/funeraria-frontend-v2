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
import { MatStepperModule } from '@angular/material/stepper';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { map } from 'rxjs/operators';

import { BrandService } from '../../brands/brand.service';
import { CategoryService } from '../../categories/category.service';
import { ItemService } from '../item.service';
import type { Item, ItemRequest } from '../item.types';

/**
 * Single component for both create + edit of items.
 *
 * <h3>Responsive layout</h3>
 *
 * - Desktop: a single card with three sections (datos / clasificación /
 *   dimensiones) stacked behind dividers.
 * - Mobile: a 2-step wizard — Datos principales then Clasificación + the
 *   conditional Dimensiones panel. Same wizard chrome as the affiliate
 *   form (horizontal stepper with `labelPosition="bottom"`, indicators
 *   that stay as numbers via `matStepperIcon` overrides).
 *
 * <h3>Conditional Dimensiones panel</h3>
 *
 * Only ataúd-style items track physical length / height / width. The
 * Dimensiones panel renders only when the selected category's name
 * contains "ataud" / "ataudes" — case- and accent-insensitive so
 * "Ataúd", "ATAÚDES", "Cajón / Ataúd" all match. When the operator
 * picks a non-ataúd category we reset the three dimension fields so a
 * later save does not silently ship stale numbers.
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
    MatStepperModule,
    NgTemplateOutlet,
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
  private readonly breakpointObserver = inject(BreakpointObserver);

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

  /**
   * `true` on phones / small tablets. Drives the wizard-vs-single-card layout
   * decision in the template.
   */
  protected readonly isHandset = toSignal(
    this.breakpointObserver
      .observe([Breakpoints.Handset, Breakpoints.TabletPortrait])
      .pipe(map((state) => state.matches)),
    { initialValue: false },
  );

  /**
   * Step 1 controls — single FormGroup so the linear stepper can validate
   * the step in isolation through `[stepControl]="datos"`.
   */
  protected readonly datos = this.fb.group({
    name: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(150)],
    }),
    // `code` is intentionally optional: on create the backend overrides our
    // value with a UUID anyway, and on edit the code is read-only (the form
    // populates it from the persisted record and we never let the operator
    // change a natural key). Keeping the control around — disabled in edit —
    // means the field still renders for display, but submission never trips
    // on an empty `code` string.
    code: this.fb.control('', { validators: [Validators.maxLength(60)] }),
    price: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(0)],
    }),
    description: this.fb.control(''),
  });

  /** Step 2 controls — classification + the conditional dimensions block. */
  protected readonly classification = this.fb.group({
    brandId: this.fb.control<number | null>(null),
    categoryId: this.fb.control<number | null>(null),
    itemLength: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
    itemHeight: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
    itemWidth: this.fb.control<number | null>(null, { validators: [Validators.min(0)] }),
  });

  /**
   * Reactive snapshot of the categoryId control. Lets us derive the
   * `dimensionsApplicable` computed without polling `value` on every CD pass.
   */
  private readonly selectedCategoryId = toSignal(
    this.classification.controls.categoryId.valueChanges,
    {
      initialValue: null as number | null,
    },
  );

  /**
   * Whether the Dimensiones panel should render. Looks up the category in
   * the cached catalog and compares an ASCII-folded, lowercased copy of its
   * name against `ataud` — that covers Ataúd, Ataud, ATAÚDES, "Cajón /
   * Ataúd", etc. in one match.
   */
  protected readonly dimensionsApplicable = computed<boolean>(() => {
    const id = this.selectedCategoryId();
    if (id === null) {
      return false;
    }
    const category = (this.categories() ?? []).find((c) => c.id === id);
    if (!category) {
      return false;
    }
    return matchesAtaud(category.name);
  });

  constructor() {
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
          this.datos.disable();
          this.classification.disable();
        }
      }
    });

    // Clear the three dimension fields whenever the selected category stops
    // being ataud-like. Without this, switching from "Ataúdes" to "Coronas"
    // would silently keep the old width / height / length on the payload.
    effect(() => {
      if (!this.dimensionsApplicable()) {
        this.classification.patchValue(
          { itemLength: null, itemHeight: null, itemWidth: null },
          { emitEvent: false },
        );
      }
    });
  }

  protected onSubmit(): void {
    const valid = this.datos.valid && this.classification.valid;
    if (!valid || this.submitting() || !this.catalogsReady()) {
      this.datos.markAllAsTouched();
      this.classification.markAllAsTouched();
      return;
    }
    // Skip the no-op `PUT` when neither step was touched (see brand-form.page.ts).
    if (this.mode === 'edit' && this.datos.pristine && this.classification.pristine) {
      void this.router.navigate(['/items']);
      return;
    }
    const datos = this.datos.getRawValue();
    const cls = this.classification.getRawValue();
    if (datos.price === null) {
      return;
    }

    const brand =
      cls.brandId !== null ? (this.brands()?.find((b) => b.id === cls.brandId) ?? null) : null;
    const category =
      cls.categoryId !== null
        ? (this.categories()?.find((c) => c.id === cls.categoryId) ?? null)
        : null;

    // Only ship dimensions when the panel was visible at submit time. Anything
    // else means the operator chose a non-ataúd category — the values, if any
    // linger from a previous selection, were already cleared by the effect.
    const dimensionsApply = this.dimensionsApplicable();

    const request: ItemRequest = {
      name: datos.name.trim(),
      description: datos.description.trim() || null,
      code: datos.code.trim(),
      price: datos.price,
      itemLength: dimensionsApply ? cls.itemLength : null,
      itemHeight: dimensionsApply ? cls.itemHeight : null,
      itemWidth: dimensionsApply ? cls.itemWidth : null,
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
        this.snackBar.open(this.mode === 'edit' ? 'Item actualizado' : 'Item creado', 'Cerrar');
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
    this.datos.patchValue({
      name: item.name,
      description: item.description ?? '',
      code: item.code,
      price: item.price,
    });
    this.classification.patchValue({
      brandId: item.brand?.id ?? null,
      categoryId: item.category?.id ?? null,
      itemLength: item.itemLength,
      itemHeight: item.itemHeight,
      itemWidth: item.itemWidth,
    });
    // Code is the natural key — once saved we never let the operator change it.
    this.datos.controls.code.disable();
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

/**
 * Returns `true` when the supplied category name represents an ataúd-family
 * record. Folding through NFD + diacritic strip means "Ataúd", "ATAÚDES" and
 * "Cajón / Ataúd" all collapse to a lowercase ASCII haystack we can `includes`
 * against. We test for `'ataud'` rather than both singular and plural because
 * `ataud` is a prefix of `ataudes` so one check covers both forms (and any
 * future variant operators might invent).
 */
function matchesAtaud(name: string): boolean {
  const normalized = name
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  return normalized.includes('ataud');
}
