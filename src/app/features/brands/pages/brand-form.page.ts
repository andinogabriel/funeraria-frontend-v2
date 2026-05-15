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

import { BrandService } from '../brand.service';
import type { Brand, BrandRequest } from '../brand.types';

/**
 * Single component for both create and edit of a brand. Two fields, no
 * relationships — the simplest form surface in the app right now.
 */
@Component({
  selector: 'app-brand-form-page',
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
  templateUrl: './brand-form.page.html',
  styleUrl: './brand-form.page.scss',
})
export class BrandFormPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly service = inject(BrandService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly mode: 'create' | 'edit' =
    this.route.snapshot.data['mode'] === 'edit' ? 'edit' : 'create';
  private readonly editId: number | null = this.parseEditId();

  protected readonly title = this.mode === 'create' ? 'Nueva marca' : 'Editar marca';

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly form = this.fb.group({
    name: this.fb.control('', {
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    webPage: this.fb.control(''),
  });

  constructor() {
    if (this.editId !== null) {
      // Load the catalog so `findById` can hydrate the form. The list is cheap
      // and the operator landing on this page likely came from the list already,
      // so the second call is usually a cache-hit at the HTTP layer.
      this.service.loadAll().subscribe(() => {
        const cached = this.service.findById(this.editId as number);
        if (cached) {
          this.patchFrom(cached);
        } else {
          this.errorMessage.set('No se encontró la marca solicitada.');
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
    const request: BrandRequest = {
      name: value.name.trim(),
      webPage: value.webPage.trim() || null,
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
        this.snackBar.open(this.mode === 'edit' ? 'Marca actualizada' : 'Marca creada', 'Cerrar');
        void this.router.navigate(['/marcas']);
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

  private patchFrom(brand: Brand): void {
    this.form.patchValue({ name: brand.name, webPage: brand.webPage ?? '' });
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
        return 'Ya existe una marca con ese nombre.';
      default:
        return detail ?? 'Ocurrió un error inesperado. Probá de nuevo.';
    }
  }
}
