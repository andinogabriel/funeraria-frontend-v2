/**
 * User transport types. Mirrors a deliberately-narrow subset of the backend's
 * `UserResponseDto` — we only consume the identity fields here because the
 * full record (mobile numbers, addresses, roles, …) belongs to a future user-
 * management surface that doesn't exist yet.
 */

/** Lightweight user record used by pickers across the app (deceasedUser, audit, …). */
export interface UserSummary {
  readonly id: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly enabled: boolean;
}
