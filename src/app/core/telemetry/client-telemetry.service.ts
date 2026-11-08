import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ActivatedRouteSnapshot, Router } from '@angular/router';

import { environment } from '../../../environments/environment';
import { AuthStore } from '../auth/auth.store';

/** Low-cardinality error categories accepted by the backend. */
export type ClientErrorKind = 'js' | 'chunk_load' | 'http';

export interface ClientErrorReport {
  readonly kind: ClientErrorKind;
  readonly message: string;
  readonly route: string;
}

export interface WebVitalReport {
  readonly name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';
  readonly value: number;
  readonly rating: 'good' | 'needs-improvement' | 'poor';
  readonly route: string;
}

/** Hard cap of error reports per page load, so an error loop cannot flood the backend. */
export const MAX_ERROR_REPORTS_PER_SESSION = 20;

const MAX_MESSAGE_LENGTH = 300;

/**
 * Ships browser-side signals to the backend (`/api/v1/client-telemetry/*`), which turns them into
 * Prometheus metrics and structured logs — so frontend errors and Web Vitals show up in the same
 * Grafana as the API, without a third-party SaaS.
 *
 * Fire-and-forget by design: every call swallows its own failure (a broken telemetry pipe must
 * never break or recursively report from the UI). Requests use `keepalive` so a report sent while
 * the tab is being hidden or closed still reaches the server.
 */
@Injectable({ providedIn: 'root' })
export class ClientTelemetryService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly authStore = inject(AuthStore);
  private readonly baseUrl = `${environment.apiBaseUrl}/v1/client-telemetry`;

  private readonly seenErrors = new Set<string>();
  private sentErrors = 0;

  reportError(kind: ClientErrorKind, message: string): void {
    const trimmed = (message || 'unknown').slice(0, MAX_MESSAGE_LENGTH);
    const dedupeKey = `${kind}:${trimmed}`;
    if (this.seenErrors.has(dedupeKey) || this.sentErrors >= MAX_ERROR_REPORTS_PER_SESSION) {
      return;
    }
    this.seenErrors.add(dedupeKey);
    this.sentErrors++;
    const body: ClientErrorReport = { kind, message: trimmed, route: this.currentRoutePattern() };
    this.send('errors', body);
  }

  reportWebVital(name: WebVitalReport['name'], value: number, rating: WebVitalReport['rating']) {
    const body: WebVitalReport = { name, value, rating, route: this.currentRoutePattern() };
    this.send('web-vitals', body);
  }

  /**
   * Route *pattern* (`/afiliados/:id`), never the concrete URL: keeps the backend metric tag
   * bounded and avoids sending ids or query strings.
   */
  currentRoutePattern(): string {
    let node: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
    const segments: string[] = [];
    while (node) {
      const path = node.routeConfig?.path;
      if (path) {
        segments.push(path);
      }
      node = node.firstChild;
    }
    return '/' + segments.join('/');
  }

  private send(path: 'errors' | 'web-vitals', body: unknown): void {
    // The endpoint requires a session. Sending anonymously (e.g. from /login) would come back
    // 401 and trip the auth error interceptor's refresh/logout flow, so skip it entirely.
    if (!this.authStore.isAuthenticated()) {
      return;
    }
    this.http.post(`${this.baseUrl}/${path}`, body, { keepalive: true }).subscribe({
      error: () => undefined,
    });
  }
}
