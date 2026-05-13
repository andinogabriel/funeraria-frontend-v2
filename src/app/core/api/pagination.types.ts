/**
 * Pagination contract mirrored from Spring Data's REST representation. The backend serialises
 * every paginated endpoint with this shape (see `org.springframework.data.domain.PageImpl` and
 * its Jackson module), so consumers can assume:
 *
 * - 0-based `number` (not 1-based — translate at the UI boundary if the design needs 1-based
 *   page indicators).
 * - `totalElements` is the global count across all pages, not the size of `content`.
 * - `first` / `last` are convenience booleans the server precomputes; trust them rather than
 *   deriving from `number` and `totalPages` (zero-result pages have edge cases).
 */
export interface Page<T> {
  readonly content: readonly T[];
  readonly number: number;
  readonly size: number;
  readonly totalElements: number;
  readonly totalPages: number;
  readonly first: boolean;
  readonly last: boolean;
  readonly numberOfElements: number;
  readonly empty: boolean;
}

/**
 * Shape that controllers expose as query parameters for pagination. Use the helpers in
 * `http-helpers.ts` (`toQueryParams`) to translate this into an `HttpParams` value — manual
 * string concatenation is the canonical way to drop parameters silently and end up with the
 * wrong page on production.
 *
 * `page` here is 0-based to match the server. If a feature wants to expose 1-based pages in
 * the URL or to the user, the conversion lives in the feature, not in this contract.
 */
export interface PageRequest {
  readonly page: number;
  readonly size: number;
  /**
   * Optional sort directives in Spring's `field,direction` format (e.g. `occurredAt,desc`).
   * Multiple sorts are expressed by repeating the param, which the helpers handle.
   */
  readonly sort?: readonly string[];
}

/** Convenience constant for the most common page request. Override `size` per feature. */
export const DEFAULT_PAGE_REQUEST: PageRequest = {
  page: 0,
  size: 25,
};
