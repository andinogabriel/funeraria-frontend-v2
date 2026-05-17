import type { DeathCause, Gender, ReceiptType, Relationship } from '../catalogs/catalogs.types';
import type { ItemPlanRequest, PlanRequest } from '../plans/plan.types';

/**
 * Transport types for the funeral (servicio) slice. Mirrors `FuneralRequestDto`
 * and `FuneralResponseDto` one-to-one — keep this file in sync when the backend
 * contract evolves.
 *
 * <h3>Date format wart</h3>
 *
 * The backend ships dates in two legacy display formats:
 *
 * - `funeralDate` / `registerDate`: `dd-MM-yyyy HH:mm` (datetime).
 * - `deceased.birthDate` / `deceased.deathDate`: `dd-MM-yyyy` (date-only).
 *
 * The request DTOs accept proper ISO formats (`yyyy-MM-ddTHH:mm:ss` for
 * datetime, `yyyy-MM-dd` for date) — so the service normalises responses on
 * the way in and the form serialises ISO on the way out. The rest of the app
 * (form state, table cells, comparisons) deals in ISO exclusively.
 */

/** Sent inside the deceased block when the operator binds a logged-in user. */
export interface DeceasedUser {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

/**
 * Optional address attached to `placeOfDeath`. The backend's request DTO
 * accepts the full shape; we keep the type here so we're ready to wire the
 * city picker when the operator asks for it. Currently the form leaves
 * `placeOfDeath` as `null` and the backend stores no address.
 */
export interface AddressRequest {
  readonly id?: number;
  readonly streetName: string;
  readonly blockStreet?: number;
  readonly apartment?: string;
  readonly flat?: string;
  readonly city: { readonly id: number; readonly name?: string };
}

/** Address as returned by `GET /funerals/{id}` — every field optional. */
export interface AddressResponse {
  readonly id?: number;
  readonly streetName?: string;
  readonly blockStreet?: number;
  readonly apartment?: string;
  readonly flat?: string;
  readonly city?: { readonly id: number; readonly name: string };
}

/** Request body for the deceased nested record. */
export interface DeceasedRequest {
  readonly firstName: string;
  readonly lastName: string;
  readonly dni: number;
  /** ISO `yyyy-MM-dd`. */
  readonly birthDate: string;
  /** ISO `yyyy-MM-dd`. */
  readonly deathDate: string;
  readonly placeOfDeath: AddressRequest | null;
  readonly gender: Pick<Gender, 'id' | 'name'>;
  readonly deceasedRelationship: Pick<Relationship, 'id' | 'name'>;
  readonly deathCause: Pick<DeathCause, 'id' | 'name'>;
  readonly deceasedUser: DeceasedUser | null;
}

/** Deceased payload as returned by the backend. Dates normalised to ISO by the service. */
export interface DeceasedResponse {
  readonly id: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly dni: number;
  readonly affiliated: boolean;
  /** ISO `yyyy-MM-dd`. */
  readonly birthDate: string;
  /** ISO `yyyy-MM-dd`. */
  readonly deathDate: string;
  /** ISO `yyyy-MM-ddTHH:mm` (no seconds — backend ships minute precision). */
  readonly registerDate: string;
  readonly placeOfDeath: AddressResponse | null;
  readonly gender: Gender;
  readonly deceasedRelationship: Relationship;
  readonly deathCause: DeathCause;
  readonly deceasedUser: DeceasedUser | null;
}

/** Request body for `POST /api/v1/funerals` and `PUT /api/v1/funerals/{id}`. */
export interface FuneralRequest {
  /** ISO datetime, `yyyy-MM-ddTHH:mm:ss`. Must be in the future or present. */
  readonly funeralDate: string;
  readonly receiptNumber: string | null;
  readonly receiptSeries: string | null;
  readonly tax: number | null;
  readonly receiptType: Pick<ReceiptType, 'id' | 'name'> | null;
  readonly deceased: DeceasedRequest;
  readonly plan: PlanRequest;
}

/** Funeral record returned by `GET /api/v1/funerals`. */
export interface Funeral {
  readonly id: number;
  /** ISO `yyyy-MM-ddTHH:mm`. */
  readonly funeralDate: string;
  /** ISO `yyyy-MM-ddTHH:mm`. */
  readonly registerDate: string;
  readonly receiptNumber: string | null;
  readonly receiptSeries: string | null;
  readonly tax: number | null;
  readonly totalAmount: number;
  readonly receiptType: ReceiptType | null;
  readonly deceased: DeceasedResponse;
  readonly plan: FuneralPlanResponse;
}

/**
 * The plan as it arrives inside a funeral response. Same fields as `Plan` but
 * we keep a dedicated alias so future divergence (e.g. plan snapshot vs. live
 * plan) does not cause cascading type changes elsewhere.
 */
export interface FuneralPlanResponse {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  readonly price: number;
  readonly profitPercentage: number;
  readonly itemsPlan: readonly {
    readonly item: {
      readonly id?: number;
      readonly name: string;
      readonly description?: string;
      readonly code: string;
      readonly price?: number;
    };
    readonly quantity: number;
  }[];
}

/** Re-export so consumers building plan payloads inside funerals stay in one import. */
export type { ItemPlanRequest, PlanRequest };
