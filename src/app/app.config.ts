import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { MAT_SNACK_BAR_DEFAULT_OPTIONS } from '@angular/material/snack-bar';

import { authInterceptor } from './core/http/auth.interceptor';
import { correlationIdInterceptor } from './core/http/correlation-id.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { routes } from './app.routes';
import { PaginatorIntlEs } from './shared/paginator-intl.es';

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
    // Material datepicker needs a date adapter. `provideNativeDateAdapter` uses the JS
    // `Date` type and is enough for birth-date inputs; if a feature later needs timezone-
    // aware date math, swap to `@angular/material-date-fns-adapter` (date-fns is already
    // a planned dep).
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'es-AR' },
    // Spanish paginator labels for every `<mat-paginator>` in the app — "1 of 2"
    // → "1 – 1 de 2", "Items per page" → "Filas por página", etc. See
    // {@link PaginatorIntlEs} for the full label set.
    { provide: MatPaginatorIntl, useClass: PaginatorIntlEs },
    // Snackbar defaults: 6 s lifetime (Material's stock 5 s felt rushed during QA).
    // Bottom-center keeps the toast close to the primary action buttons (which
    // sit at the bottom of every form / dialog) so the operator's eye doesn't
    // have to jump to the top of the viewport after submitting.
    {
      provide: MAT_SNACK_BAR_DEFAULT_OPTIONS,
      useValue: { duration: 6000, horizontalPosition: 'center', verticalPosition: 'bottom' },
    },
  ],
};
