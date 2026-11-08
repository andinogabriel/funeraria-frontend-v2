import { HttpErrorResponse } from '@angular/common/http';
import { ErrorHandler, Injectable, inject } from '@angular/core';

import { ClientErrorKind, ClientTelemetryService } from './client-telemetry.service';

/**
 * Global error handler: keeps Angular's default console logging and additionally reports the
 * error to the backend. `provideBrowserGlobalErrorListeners()` routes uncaught window errors and
 * unhandled promise rejections here too.
 *
 * A failed lazy-chunk load (typical right after a deploy, when an open tab asks for a bundle hash
 * that no longer exists) is classified as `chunk_load` so it can be alerted on separately.
 */
@Injectable()
export class TelemetryErrorHandler extends ErrorHandler {
  private readonly telemetry = inject(ClientTelemetryService);

  override handleError(error: unknown): void {
    super.handleError(error);
    try {
      this.telemetry.reportError(classify(error), messageOf(error));
    } catch {
      // Never let reporting break the app.
    }
  }
}

export function classify(error: unknown): ClientErrorKind {
  if (error instanceof HttpErrorResponse) {
    return 'http';
  }
  const message = messageOf(error);
  if (/Loading chunk|dynamically imported module|ChunkLoadError/i.test(message)) {
    return 'chunk_load';
  }
  return 'js';
}

function messageOf(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    return `${error.status} ${error.url ?? ''}`.trim();
  }
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
