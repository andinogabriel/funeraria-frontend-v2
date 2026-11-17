/**
 * Auth-related transport types. One-to-one match with the backend OpenAPI schemas under
 * `Authentication` so the wire contract is explicit and any drift (e.g. a new field on
 * JwtDto) is caught at compile time the next time the types are regenerated.
 *
 * The refresh token never appears here: the backend sends it only in the HttpOnly
 * `refresh_token` cookie (Path=/api/v1/users), which page script cannot read and the browser
 * attaches to login, refresh and logout on its own.
 */

/** Identifies the device a session is bound to. Required by every auth-related endpoint. */
export interface DeviceInfo {
  readonly deviceId: string;
  readonly deviceType: string;
}

/** Request body for `POST /api/v1/users/login`. */
export interface UserLoginRequest {
  readonly email: string;
  readonly password: string;
  readonly deviceInfo: DeviceInfo;
}

/** Request body for `POST /api/v1/users/refresh`; the token itself travels in the cookie. */
export interface TokenRefreshRequest {
  readonly deviceInfo: DeviceInfo;
}

/** Request body for `PUT /api/v1/users/logout`. */
export interface LogoutRequest {
  readonly token: string;
  readonly deviceInfo: DeviceInfo;
}

/**
 * Response from `POST /api/v1/users/login` and `POST /api/v1/users/refresh`.
 *
 * `authorization` already carries the scheme prefix (`Bearer <token>`) — copy it verbatim
 * into the `Authorization` header. `expiryDuration` is milliseconds.
 */
export interface JwtResponse {
  readonly authorization: string;
  readonly expiryDuration: number;
  readonly authorities: readonly string[];
}

/** The active session, held in memory only. */
export interface AuthSession {
  readonly authorization: string;
  readonly authorities: readonly string[];
  /** Wall-clock instant (ms since epoch) at which the access token stops being valid. */
  readonly expiresAt: number;
}
