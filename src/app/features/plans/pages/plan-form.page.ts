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

import { ItemService } from '../../items/item.service';
import { PlanService } from '../plan.service';
import type { Plan, PlanRequest } from '../plan.types';

/**
 * Single component for both create and edit. `mode` is read from the static route
 * data and the edit id is parsed from the `:id` segment — same pattern as the
 * affiliate form, see the NG0950 lessons learned there.
 *
 * <h3>Items sub-form</h3>
 *
 * Each plan bundles a `Set<ItemPlanRequest>`: a list of catalog items with the
 * quantity the plan packages. We model that as a `FormArray` of sub-groups, with
 * a button to add a new row and an icon button to remove an existing row. The
 * available items come from {@link ItemService} which fetches `/api/v1/items`
 * once on construction.
 *
 * The backend computes the plan's final `price` from items + quantities +
 * `profitPercentage`, so the form never asks for `price` — that field shows up
 * only on the list view as a read-only column.
 */
@Component({
  selector: 'app-plan-form-page',
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
  templateUrl: './plan-form.page.html',
  styleUrl: './plan-form.page.scss',
})
export class PlanFormPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly planService = inject(PlanService);
  private readonly itemService = inject(ItemService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly mode: 'create' | 'edit' =
    this.route.snapshot.data['mode'] === 'edit' ? 'edit' : 'create';

  private readonly editId: number | null = this.parseEditId();

  protected readonly title = this.mode === 'create' ? 'Nuevo plan' : 'Editar plan';

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  /** Catalog of items used to populate the picker dropdown inside each item row. */
  protected readonly items = this.itemService.list;
  protected readonly itemsLoading = this.itemService.loading;

  /** Convenience for the template — disables the submit while we are still loading. */
  protected readonly itemsReady = computed(() => this.items() !== null);

  /**
   * Plan form. `name` and `profitPercentage` are required; `description` is free-text.
   * The `itemsPlan` FormArray starts empty in create mode and is hydrated from the
   * cached plan in edit mode (see {@link patchFrom}). We allow zero items at submit
   * time — the backend's `@NotNull` only enforces non-null, not non-empty — so users
   * can save a draft and add items later.
   */
  protected readonly form = this.fb.group({
    name: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    description: this.fb.control(''),
    profitPercentage: this.fb.control<number | null>(null, {
      validators: [Validators.required, Validators.min(0), Validators.max(9_999_999.99)],
    }),
    itemsPlan: this.fb.array<ReturnType<PlanFormPage['createItemGroup']>>([]),
  });

  /** Typed convenience handle to the FormArray — the template uses it heavily. */
  protected get itemsPlan(): FormArray<ReturnType<PlanFormPage['createItemGroup']>> {
    return this.form.controls.itemsPlan;
  }

  constructor() {
    // Items catalog is needed regardless of mode (form picker). Plan list refresh
    // runs in parallel because the edit path reads the cached plan from there.
    forkJoin([this.itemService.loadAll(), this.planService.loadAll()]).subscribe(() => {
      if (this.editId !== null) {
        const cached = this.planService.findById(this.editId);
        if (cached) {
          this.patchFrom(cached);
        } else {
          this.errorMessage.set('No se encontró el plan solicitado.');
          this.form.disable();
        }
      }
    });
  }

  /** Appends an empty item row to the FormArray. */
  protected onAddItem(): void {
    this.itemsPlan.push(this.createItemGroup());
  }

  /** Removes the item row at the given index. */
  protected onRemoveItem(index: number): void {
    this.itemsPlan.removeAt(index);
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting() || !this.itemsReady()) {
      this.form.markAllAsTouched();
      return;
    }
    // Skip the no-op `PUT` when nothing changed (see brand-form.page.ts).
    if (this.mode === 'edit' && this.form.pristine) {
      void this.router.navigate(['/planes']);
      return;
    }
    const value = this.form.getRawValue();
    if (value.profitPercentage === null) {
      return;
    }

    // Resolve each row's item by code against the catalog so the payload carries
    // id + name + code — the backend's `ItemRequestPlanDto` accepts any subset
    // but sending the trio is the most defensive option (id for uniqueness, name
    // + code for human-readable error messages on the server side).
    const catalog = this.items() ?? [];
    const itemsPlan = value.itemsPlan
      .map((row) => {
        const itemCode = row.code as string | null;
        if (itemCode === null) {
          return null;
        }
        const catalogEntry = catalog.find((entry) => entry.code === itemCode);
        if (!catalogEntry) {
          return null;
        }
        return {
          item: { id: catalogEntry.id, name: catalogEntry.name, code: catalogEntry.code },
          quantity: row.quantity as number,
        };
      })
      .filter(
        (row): row is { item: { id: number; name: string; code: string }; quantity: number } =>
          row !== null,
      );

    const request: PlanRequest = {
      name: value.name.trim(),
      description: value.description.trim() || null,
      profitPercentage: value.profitPercentage,
      itemsPlan,
    };

    this.submitting.set(true);
    this.errorMessage.set(null);
    const observable =
      this.mode === 'edit' && this.editId !== null
        ? this.planService.update(this.editId, request)
        : this.planService.create(request);

    observable.subscribe({
      next: () => {
        this.submitting.set(false);
        this.snackBar.open(this.mode === 'edit' ? 'Plan actualizado' : 'Plan creado', 'Cerrar');
        void this.router.navigate(['/planes']);
      },
      error: (err: { status?: number; error?: { detail?: string } }) => {
        this.submitting.set(false);
        this.errorMessage.set(this.mapError(err.status ?? 0, err.error?.detail));
      },
    });
  }

  /**
   * Factory for a single item-row FormGroup. We type the controls as
   * `code: string | null` + `quantity: number | null` so create mode starts empty
   * and the validators surface required errors on first touch. The item picker
   * binds to `code` because it is the catalog's natural key.
   */
  private createItemGroup() {
    return this.fb.group({
      code: this.fb.control<string | null>(null, { validators: [Validators.required] }),
      quantity: this.fb.control<number | null>(null, {
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

  private patchFrom(plan: Plan): void {
    this.form.patchValue({
      name: plan.name,
      description: plan.description ?? '',
      profitPercentage: plan.profitPercentage,
    });
    // Replace the FormArray contents with one row per persisted item.
    this.itemsPlan.clear();
    for (const row of plan.itemsPlan) {
      const group = this.createItemGroup();
      group.patchValue({ code: row.item.code, quantity: row.quantity });
      this.itemsPlan.push(group);
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
        return 'Ya existe un plan con ese nombre.';
      default:
        return detail ?? 'Ocurrió un error inesperado. Probá de nuevo.';
    }
  }
}
