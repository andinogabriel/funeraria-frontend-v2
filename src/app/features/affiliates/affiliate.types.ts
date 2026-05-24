import type { Gender, Relationship } from '../catalogs/catalogs.types';

/**
 * Affiliate transport types. Mirrors the backend OpenAPI under the `Affiliates` tag
 * one-to-one, with one caveat documented below about date formats.
 *
 * <h3>Date format wart</h3>
 *
 * The backend uses two different date formats on the wire:
 *
 * - {@link AffiliateRequest#birthDate} is **`yyyy-MM-dd`** (ISO-8601).
 * - {@link AffiliateResponse#birthDate} and {@link AffiliateResponse#startDate} are
 *   **`dd-MM-yyyy`** (legacy display format).
 *
 * Consumers should never propagate the response format into form state or other
 * services — the affiliate service normalises both fields to ISO `yyyy-MM-dd` on read,
 * so the rest of the app deals in one format only. The legacy strings only exist as a
 * brief intermediate value inside the service.
 */

/** Request body for `POST /api/v1/affiliates` and `PUT /api/v1/affiliates/{dni}`. */
export interface AffiliateRequest {
  readonly id?: number;
  readonly firstName: string;
  readonly lastName: string;
  /** ISO-8601 date string, `yyyy-MM-dd`. */
  readonly birthDate: string;
  readonly dni: number;
  readonly relationship: Pick<Relationship, 'id' | 'name'>;
  readonly gender: Pick<Gender, 'id' | 'name'>;
}

/**
 * Application-facing affiliate shape. Identical to what the backend returns except both
 * date fields are guaranteed to be ISO-8601 (`yyyy-MM-dd`) — see the file Javadoc above.
 */
export interface Affiliate {
  readonly firstName: string;
  readonly lastName: string;
  readonly dni: number;
  /** ISO-8601 date string, `yyyy-MM-dd`. */
  readonly birthDate: string;
  /** ISO-8601 date string, `yyyy-MM-dd`. */
  readonly startDate: string;
  readonly deceased: boolean;
  readonly gender: Gender;
  readonly relationship: Relationship;
  /**
   * ISO-8601 UTC instant when the affiliate was soft-deleted, or `null` for active
   * affiliates. Only populated by the admin papelera endpoint
   * (`GET /api/v1/affiliates/deleted`); the regular listings filter deleted rows out so
   * this field is always `null` there.
   */
  readonly deletedAt: string | null;
  /**
   * Email of the admin that requested the soft-delete, or `null` for active affiliates.
   * Same population semantics as {@link deletedAt}.
   */
  readonly deletedBy: string | null;
}

/** Server-side paginated response — Spring Data `Page<AffiliateResponseDto>`. */
export interface AffiliatePage {
  readonly content: readonly Affiliate[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly size: number;
  readonly number: number;
  readonly first: boolean;
  readonly last: boolean;
}

/**
 * Query parameters accepted by `GET /api/v1/affiliates/deleted` — the admin papelera
 * surface. Empty / undefined fields are dropped from the URL, same sentinel pattern as
 * {@link AffiliatePageQuery}.
 */
export interface AffiliateBinPageQuery {
  readonly page?: number;
  readonly limit?: number;
  /** Case-insensitive substring against the affiliate's first name. */
  readonly firstName?: string;
  /** Case-insensitive substring against the affiliate's last name. */
  readonly lastName?: string;
  /** Case-insensitive substring against the affiliate's DNI cast to string. */
  readonly dni?: string;
  /** Case-insensitive substring against the admin email captured at delete time. */
  readonly deletedBy?: string;
  /** Inclusive lower bound on `deletedAt`, ISO-8601 UTC instant. */
  readonly deletedFrom?: string;
  /** Inclusive upper bound on `deletedAt`, ISO-8601 UTC instant. */
  readonly deletedTo?: string;
}

/** Query parameters accepted by `GET /api/v1/affiliates/paginated`. */
export interface AffiliatePageQuery {
  readonly page?: number;
  readonly limit?: number;
  readonly sortBy?: string;
  readonly sortDir?: 'asc' | 'desc';
  /** Case-insensitive substring against the affiliate's first name. */
  readonly firstName?: string;
  /** Case-insensitive substring against the affiliate's last name. */
  readonly lastName?: string;
  /** Case-insensitive substring against the affiliate's DNI cast to string. */
  readonly dni?: string;
  /**
   * Exact match on the affiliate's relationship name. The list page feeds this from an
   * in-menu autocomplete sourced from the distinct relationship names of the currently
   * loaded rows.
   */
  readonly relationshipName?: string;
  /** Inclusive lower bound on birthDate as ISO `yyyy-MM-dd`. */
  readonly from?: string;
  /** Inclusive upper bound on birthDate as ISO `yyyy-MM-dd`. */
  readonly to?: string;
}
