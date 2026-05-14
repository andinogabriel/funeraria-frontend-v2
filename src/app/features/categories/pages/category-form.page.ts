import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { CategoryService } from '../category.service';
import type { Category, CategoryRequest } from '../category.types';

@Component({
  selector: 'app-category-form-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './category-form.page.html',
  styleUrl: './category-form.page.scss',
})
export class CategoryFormPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(CategoryService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly mode: 'create' | 'edit' =
    this.route.snapshot.data['mode'] === 'edit' ? 'edit' : 'create';
  private readonly editId: number | null = this.parseEditId();

  protected readonly title = this.mode === 'create' ? 'Nueva categoría' : 'Editar categoría';

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    description: this.fb.control(''),
  });

  constructor() {
    if (this.editId !== null) {
      this.service.loadAll().subscribe(() => {
        const cached = this.service.findById(this.editId as number);
        if (cached) {
          this.patchFrom(cached);
        } else {
          this.errorMessage.set('No se encontró la categoría solicitada.');
          this.form.disable();
        }
      });
    }
  }

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const request: CategoryRequest = {
      name: value.name.trim(),
      description: value.description.trim() || null,
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
          this.mode === 'edit' ? 'Categoría actualizada' : 'Categoría creada',
          'OK',
          { duration: 3000 },
        );
        void this.router.navigate(['/categorias']);
      },
      error: (err: { status?: number; error?: { detail?: string } }) => {
        this.submitting.set(false);
        this.errorMessage.set(this.mapError(err.status ?? 0, err.error?.detail));
      },
    });
  }

  private parseEditId(): number | null {
    if (this.route.snapshot.data['mode'] !== 'edit') return null;
    const raw = this.route.snapshot.paramMap.get('id');
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private patchFrom(category: Category): void {
    this.form.patchValue({ name: category.name, description: category.description ?? '' });
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
        return 'Ya existe una categoría con ese nombre.';
      default:
        return detail ?? 'Ocurrió un error inesperado. Probá de nuevo.';
    }
  }
}
