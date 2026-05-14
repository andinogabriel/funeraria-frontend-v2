import { Injectable } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';

/**
 * Spanish (es-AR) labels for {@link MatPaginatorIntl}. Material's default text is
 * English ("1 of 5", "Items per page:", etc.); registering this subclass as the
 * `MatPaginatorIntl` provider routes every paginator in the app through the
 * Spanish copy without per-call configuration.
 *
 * The class is annotated `@Injectable()` so Angular DI can construct it; pair it
 * with `{ provide: MatPaginatorIntl, useClass: PaginatorIntlEs }` in the app
 * config.
 */
@Injectable()
export class PaginatorIntlEs extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Filas por página:';
  override nextPageLabel = 'Página siguiente';
  override previousPageLabel = 'Página anterior';
  override firstPageLabel = 'Primera página';
  override lastPageLabel = 'Última página';

  /**
   * Mirrors Material's default range formatter but in Spanish. Handles the empty
   * dataset case (no rows) and the page-out-of-bounds case (negative start index)
   * the same way Material does, so the consumer experience stays consistent
   * across both languages.
   */
  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return `0 de ${length}`;
    }
    const total = Math.max(length, 0);
    const startIndex = page * pageSize;
    // If the start index exceeds the list length the user paged past the end —
    // mirror Material's behaviour and clamp instead of returning negatives.
    const endIndex =
      startIndex < total ? Math.min(startIndex + pageSize, total) : startIndex + pageSize;
    return `${startIndex + 1} – ${endIndex} de ${total}`;
  };
}
