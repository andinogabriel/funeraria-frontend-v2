import { registerLocaleData } from '@angular/common';
import localeEsAr from '@angular/common/locales/es-AR';
import {
  ApplicationConfig,
  LOCALE_ID,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';

import { authInterceptor } from './core/http/auth.interceptor';
import { correlationIdInterceptor } from './core/http/correlation-id.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { routes } from './app.routes';

// Register the `es-AR` ICU data globally so any pipe / formatter that takes the locale
// (CurrencyPipe, DatePipe, DecimalPipe, formatNumber, etc.) finds it. Without this call
// Angular ships only `en-US` in the bundle and throws NG0701 the first time a template
// renders `... | currency: 'ARS' : ... : 'es-AR'`. The import is module-scoped so the
// data lives in the main bundle and not behind a lazy chunk.
registerLocaleData(localeEsAr);

/**
 * Root application configuration. Wires the modern Angular 20 surface:
 * - Zoneless change detection: no Zone.js polyfill, signals drive updates explicitly.
 * - HttpClient with the native fetch backend and a functional interceptor pipeline.
 *   Order matters: correlation id is stamped first (so it travels with both the original
 *   request and any retry), auth attaches credentials, error handles 401 → refresh → retry.
 * - Animations are provided lazily so the initial bundle stays small until Material
 *   components actually need them.
 * - Router with component input binding (route params flow as @Input() / inputs() signals)
 *   and view transitions for smooth route-to-route fade out of the box.
 *
 * Material datepicker + paginator providers used to live here too. They moved to the
 * lazy authenticated subtree ({@code authenticated.routes.ts}) so pre-auth visitors
 * to `/home` or `/login` no longer download `@angular/material/core` and
 * `@angular/material/paginator`. The bare-minimum tokens that the public pages
 * actually need (the snackbar defaults) stay here.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(
      withFetch(),
      withInterceptors([correlationIdInterceptor, authInterceptor, errorInterceptor]),
    ),
    provideAnimationsAsync(),
    // Angular's default LOCALE_ID is `en-US`. Setting it to `es-AR` aligns the implicit
    // formatter behaviour with the one we already use through the explicit locale on
    // currency / date pipes, so a developer that forgets the explicit arg still gets
    // Argentine formatting instead of US.
    { provide: LOCALE_ID, useValue: 'es-AR' },
    // Snackbar defaults: 6 s lifetime (Material's stock 5 s felt rushed during QA).
    // Bottom-center keeps the toast close to the primary action buttons (which
    // sit at the bottom of every form / dialog) so the operator's eye doesn't
    // have to jump to the top of the viewport after submitting. Stays here
    // because login can show snackbars on auth failure.
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: { duration: 6000, horizontalPosition: 'center', verticalPosition: 'bottom' },
    },
  ],
};
