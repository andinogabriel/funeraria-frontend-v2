import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { AuthService } from '../../../core/auth/auth.service';
import { HeroCarouselComponent, type HeroSlide } from '../../../shared/hero-carousel';

/**
 * Login page. Split-screen layout: a storytelling hero carousel on the left
 * (lg+) and a glass-card sign-in form on the right; on phones the carousel
 * shrinks to a single landscape strip above the form so the email field stays
 * above the fold. Typed reactive form (no untyped FormGroup), Material form
 * fields, signal-driven submitting + error state so the template stays
 * declarative and zoneless.
 *
 * <h3>Why a carousel on the auth screen</h3>
 *
 * The login page is the first surface a new operator sees. A static brand
 * panel only sells one message; a carousel rotates through the four pillars
 * the consola actually delivers (afiliados, planes, servicios, seguridad real)
 * so the first impression also functions as a quick product tour. The slides
 * reuse the dashboard SVG illustrations bundled under `public/dashboard/`.
 *
 * <h3>Security copy</h3>
 *
 * The previous version of this page advertised "doble factor de dispositivo",
 * which sounded like classic 2FA (TOTP / SMS) but actually describes the
 * device-bound JWT scheme from ADR-0002 — different mechanism, different
 * promise. The current copy describes the real thing without overpromising:
 * the session is cryptographically bound to the device that signed in and the
 * audit trail records every sensitive action.
 *
 * <h3>Routing</h3>
 *
 * On success the user is redirected to either the URL they originally tried
 * to reach (carried by the `returnUrl` query param the auth guard sets) or
 * `/dashboard`. On failure a short message is rendered inside the form; the
 * recovery path stays attached to the input that caused it.
 */
@Component({
  selector: 'app-login-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    HeroCarouselComponent,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
    RouterLink,
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

  /** Toggle for the password show / hide affordance — flipped from the template. */
  protected readonly showPassword = signal(false);

  /**
   * Storytelling slides for the brand panel. Five rotating messages, one per
   * pillar of the application, each backed by the dashboard SVGs. The CTAs
   * are intentionally absent: this surface is pre-auth, the only valid call
   * to action is "sign in".
   */
  protected readonly heroSlides: readonly HeroSlide[] = [
    {
      backgroundUrl: '/dashboard/slide-serenidad.svg',
      eyebrow: 'Bienvenido',
      title: 'Acompañamos a quienes acompañan',
      subtitle:
        'Una consola pensada para la operación diaria de una funeraria — afiliados, planes y servicios en un solo lugar.',
    },
    {
      backgroundUrl: '/dashboard/slide-acompanamiento.svg',
      eyebrow: 'Afiliados',
      title: 'Padrón centralizado y trazable',
      subtitle:
        'Altas, modificaciones y consultas integradas, con historial completo de cada cambio.',
    },
    {
      backgroundUrl: '/dashboard/slide-memoria.svg',
      eyebrow: 'Planes',
      title: 'Diseñá planes a la medida de cada familia',
      subtitle:
        'Combiná items del catálogo, definí márgenes y mantené el precio actualizado sin recalcular a mano.',
    },
    {
      backgroundUrl: '/dashboard/slide-naturaleza.svg',
      eyebrow: 'Servicios',
      title: 'Registrá un servicio en minutos',
      subtitle:
        'Datos del fallecido, plan y recibo en un único formulario; nada queda pendiente entre pantallas.',
    },
    {
      backgroundUrl: '/dashboard/slide-cielo.svg',
      eyebrow: 'Seguridad',
      title: 'Tu sesión, vinculada a tu dispositivo',
      subtitle:
        'Los tokens de acceso se firman con la huella de este equipo y cada acción sensible queda en el registro de auditoría.',
    },
  ];

  /**
   * Optional contextual banner rendered above the form when the user was
   * redirected here by the error interceptor. The interceptor sets
   * `?reason=expired` for the general "session no longer valid" case and
   * `?reason=blocked` when the backend's threat-protection adapter rejected
   * the refresh (typically because too many failed-auth attempts blacklisted
   * the principal — recoverable by waiting an hour or by restarting the
   * backend in development).
   */
  protected readonly contextMessage = ((): string | null => {
    const reason = this.route.snapshot.queryParamMap.get('reason');
    if (reason === 'blocked') {
      return 'Tu sesión fue bloqueada por seguridad. Reintentá el login en unos minutos.';
    }
    if (reason === 'expired') {
      return 'Tu sesión expiró. Ingresá de nuevo para continuar.';
    }
    return null;
  })();

  protected toggleShowPassword(): void {
    this.showPassword.update((current) => !current);
  }

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
