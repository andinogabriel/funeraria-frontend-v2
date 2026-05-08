import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';

/**
 * Login page. Typed reactive form (no untyped FormGroup), Material form fields, signal-
 * driven submitting + error state so the template stays declarative and zoneless.
 *
 * On success the user is redirected to either the URL they originally tried to reach
 * (carried by the `returnUrl` query param the auth guard sets) or `/dashboard`. On
 * failure a short message is rendered inside the form; we deliberately do not surface a
 * separate snackbar because keeping the error attached to the form makes the recovery
 * path obvious.
 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  templateUrl: './login.page.html',
  styleUrl: './login.page.scss',
})
export class LoginPage {
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly form = this.fb.group({
    email: this.fb.control('', { validators: [Validators.required, Validators.email] }),
    password: this.fb.control('', { validators: [Validators.required, Validators.minLength(8)] }),
  });

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected onSubmit(): void {
    if (this.form.invalid || this.submitting()) {
      this.form.markAllAsTouched();
      return;
    }
    const { email, password } = this.form.getRawValue();
    this.submitting.set(true);
    this.errorMessage.set(null);

    this.auth.login(email, password).subscribe({
      next: () => {
        this.submitting.set(false);
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl') ?? '/dashboard';
        void this.router.navigateByUrl(returnUrl);
      },
      error: (err: { status?: number }) => {
        this.submitting.set(false);
        this.errorMessage.set(this.mapError(err.status ?? 0));
      },
    });
  }

  /** Translates the few error statuses login can produce into human-readable Spanish. */
  private mapError(status: number): string {
    switch (status) {
      case 400:
        return 'Datos inválidos. Revisá email y contraseña.';
      case 401:
        return 'Credenciales incorrectas.';
      case 429:
        return 'Demasiados intentos. Esperá unos minutos antes de volver a probar.';
      case 0:
        return 'No se pudo contactar al servidor. Verificá tu conexión.';
      default:
        return 'Ocurrió un error inesperado. Probá de nuevo en unos instantes.';
    }
  }
}
