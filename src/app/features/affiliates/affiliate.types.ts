import type { Gender, Relationship } from '../catalogs/catalogs.types';
import type { HealthTier } from '../membership/membership.types';

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

/**
 * Holder ("titular"): the relative who enrols the affiliate, pays the monthly dues and claims the
 * service. The DNI identifies them; the backend reuses an existing holder with the same DNI.
 */
export interface MembershipHolderRequest {
  readonly dni: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone?: string;
  readonly email?: string;
}

export interface MembershipHolder {
  readonly id: number;
  readonly dni: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string | null;
  readonly email: string | null;
}

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
  readonly holder: MembershipHolderRequest;
  /** Tariff health tier code (STANDARD, GRADED, SPECIAL...); prices the monthly fee. */
  readonly healthTierCode: string;
  /**
   * Enrolment date ("fecha de alta"), ISO `yyyy-MM-dd`; the claim waiting period counts from it.
   * Optional: the backend uses today on create and keeps the stored date on update when omitted.
   */
  readonly enrolmentDate?: string;
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
  /** Who pays for this affiliate. `null` for affiliates created before billing existed. */
  readonly holder: MembershipHolder | null;
  /** Health tier the fee was priced with. `null` for legacy affiliates. */
  readonly healthTier: HealthTier | null;
  /** Age band the fee was priced with (e.g. `36-50`). `null` for legacy affiliates. */
  readonly ageBandLabel: string | null;
  /** Monthly fee assigned at enrolment or the last repricing. `null` for legacy affiliates. */
  readonly monthlyFee: number | null;
  /** ISO-8601 date (`yyyy-MM-dd`) the fee was calculated. `null` for legacy affiliates. */
  readonly feeCalculatedOn: string | null;
  /**
   * ISO-8601 enrolment date (`yyyy-MM-dd`) the claim waiting period counts from. Unlike
   * {@link startDate} (the day the record was created) it can be back-dated. `null` only when
   * talking to a backend older than the field.
   */
  readonly enrolmentDate: string | null;
}

/** A holder with every affiliate they cover and what they pay per month. */
export interface MembershipHolderDetail {
  readonly holder: MembershipHolder;
  /** Alive affiliates with a fee assigned. */
  readonly activeAffiliates: number;
  /** Sum of the fees of {@link activeAffiliates}. */
  readonly monthlyTotal: number;
  readonly affiliates: readonly Affiliate[];
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
