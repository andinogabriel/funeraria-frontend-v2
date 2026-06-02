/**
 * Wire types for the membership-fee tariff endpoints. Mirror the backend DTOs
 * (`TariffConfigResponseDto`, `FeeQuoteResponseDto` and the update payloads) one-to-one.
 * Monetary amounts and multipliers arrive as JSON numbers (BigDecimal on the server).
 */

/** One health-risk tier of the tariff. `code` is the immutable lookup key. */
export interface HealthTier {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly healthMultiplier: number;
  readonly waitingPeriodMonths: number;
  readonly displayOrder: number;
}

/** One age band of the tariff. `maxAge` is null for an open-ended band. */
export interface AgeBand {
  readonly id: number;
  readonly minAge: number;
  readonly maxAge: number | null;
  readonly ageMultiplier: number;
  readonly label: string;
  readonly displayOrder: number;
}

/** Full tariff configuration rendered by the admin screen. */
export interface TariffConfig {
  readonly baseAmount: number;
  readonly maxIssueAge: number;
  readonly overdueGraceCount: number;
  readonly healthTiers: readonly HealthTier[];
  readonly ageBands: readonly AgeBand[];
}

/**
 * Result of quoting a monthly fee. When `insurable` is false the fee, band and waiting period
 * are null and `reason` carries a machine code (e.g. `ABOVE_MAX_ISSUE_AGE`, `NO_AGE_BAND`).
 */
export interface FeeQuote {
  readonly insurable: boolean;
  readonly monthlyFee: number | null;
  readonly age: number;
  readonly ageBandLabel: string | null;
  readonly healthTierCode: string;
  readonly healthTierName: string;
  readonly waitingPeriodMonths: number | null;
  readonly reason: string | null;
}

/** Edit of a single health tier (code immutable, omitted). */
export interface HealthTierUpdate {
  readonly id: number;
  readonly name: string;
  readonly healthMultiplier: number;
  readonly waitingPeriodMonths: number;
}

/** Edit of a single age band (age bounds fixed, omitted). */
export interface AgeBandUpdate {
  readonly id: number;
  readonly ageMultiplier: number;
  readonly label: string;
}

/** Full tariff edit payload sent to `PUT /api/v1/membership/tariff`. */
export interface TariffConfigUpdate {
  readonly baseAmount: number;
  readonly maxIssueAge: number;
  readonly overdueGraceCount: number;
  readonly healthTiers: readonly HealthTierUpdate[];
  readonly ageBands: readonly AgeBandUpdate[];
}
