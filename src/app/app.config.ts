import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';

import { authInterceptor } from './core/http/auth.interceptor';
import { correlationIdInterceptor } from './core/http/correlation-id.interceptor';
import { errorInterceptor } from './core/http/error.interceptor';
import { routes } from './app.routes';

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
  ],
};
