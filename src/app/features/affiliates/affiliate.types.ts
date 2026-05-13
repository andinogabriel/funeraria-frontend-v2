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
}
