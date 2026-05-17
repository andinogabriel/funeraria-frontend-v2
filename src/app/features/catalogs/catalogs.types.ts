/**
 * Reference catalog transport types. Mirrors the backend OpenAPI schemas under the
 * `Catalogs` tag one-to-one — keep this in sync when the contract evolves.
 *
 * All catalogs in this slice are read-only from the frontend's point of view. The
 * underlying tables are seeded by Flyway (see backend `V2__seed_reference_data.sql`)
 * and there is no UI to mutate them; admin tooling for brands and categories is the
 * exception and lives in its own slice.
 */

/** Argentine province. `code31662` is the ISO 3166-2:AR code (e.g. `AR-C`, `AR-B`). */
export interface Province {
  readonly id: number;
  readonly name: string;
  readonly code31662?: string;
}

/**
 * City inside a province. The backend returns `province` as the full {@link Province}
 * object (not just an id), which is convenient for tabular display but means consumers
 * should treat the nested province as immutable reference data, not as a snapshot to
 * mutate.
 */
export interface City {
  readonly id: number;
  readonly name: string;
  readonly zipCode?: string;
  readonly province?: Province;
}

/** Gender (Femenino / Masculino / Otro). Used by affiliate, deceased and user records. */
export interface Gender {
  readonly id: number;
  readonly name: string;
}

/**
 * Kinship between an affiliate and the policy holder (Padre, Madre, Hijo/a, Hermano/a,
 * Cónyuge, …). The full set lives in `V2__seed_reference_data.sql`.
 */
export interface Relationship {
  readonly id: number;
  readonly name: string;
}

/** Death cause (Muerte súbita, Suicidio, Accidente de tránsito, …). */
export interface DeathCause {
  readonly id: number;
  readonly name: string;
}

/** Role granted to a user (ROLE_ADMIN, ROLE_USER, …). */
export interface Role {
  readonly id: number;
  readonly name: string;
}

/**
 * Type of receipt issued for a funeral service (Egreso, Ingreso, …). The funeral
 * form picks one and the backend defaults to "Egreso" when omitted, but the
 * picker is still exposed so the operator can override the default.
 */
export interface ReceiptType {
  readonly id: number;
  readonly name: string;
}
