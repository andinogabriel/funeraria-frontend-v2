/**
 * One device session of the signed-in user (backend `UserSessionResponseDto`, ADR-0024 there).
 * Dates are ISO-8601 strings, as sent.
 */
export interface ActiveSession {
  readonly id: number;
  readonly deviceType: string | null;
  readonly userAgent: string | null;
  readonly ipAddress: string | null;
  /** When the session was opened: its last login on that device. */
  readonly createdAt: string | null;
  /** Last login or token refresh. */
  readonly lastSeenAt: string | null;
  /** Whether this is the session of this browser. */
  readonly current: boolean;
}

/** A User-Agent reduced to what a person recognises. */
export interface DeviceDescription {
  readonly browser: string;
  readonly os: string;
  readonly mobile: boolean;
}
