import {
  ApplicationConfig,
  provideBrowserGlobalErrorListeners,
  provideZonelessChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';

/**
 * Root application configuration. Wires the modern Angular 20 surface:
 * - Zoneless change detection: no Zone.js polyfill, signals drive updates explicitly.
 * - HttpClient with the native fetch backend and a functional interceptor pipeline; concrete
 *   interceptors (auth, error, correlation id) are added in the Core slice and registered here.
 * - Animations are provided lazily so the initial bundle stays small until Material components
 *   actually need them.
 * - Router with component input binding (route params flow as @Input() / inputs() signals) and
 *   view transitions for the smooth route-to-route fade out of the box.
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZonelessChangeDetection(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    provideHttpClient(withFetch(), withInterceptors([])),
    provideAnimationsAsync(),
  ],
};
