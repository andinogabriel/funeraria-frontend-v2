/**
 * Transport types for the in-app notification slice. Mirrors the backend's
 * `NotificationResponseDto` and `NotificationPage` shapes one-to-one. Keep this
 * file in sync when the backend adds new types.
 */

/**
 * Closed catalog of notification kinds. v1 ships only `LOW_STOCK_REACHED`; future
 * PRs can drop in more values without a schema migration on either side.
 */
export type NotificationType = 'LOW_STOCK_REACHED';

/**
 * Payload carried by a `LOW_STOCK_REACHED` notification. Matches the JSON shape the
 * backend's `NotificationConsumer.buildPayload` writes verbatim.
 */
export interface LowStockReachedPayload {
  readonly itemId: number;
  readonly code: string;
  readonly name: string;
  readonly threshold: number;
  readonly stockBefore: number;
  readonly stockAfter: number;
}

/** Wire shape for a single notification. */
export interface Notification {
  readonly id: number;
  readonly type: NotificationType;
  readonly audience: string;
  /**
   * Type-specific payload. The backend ships this as a real JSON object thanks to
   * `@JsonRawValue` on the response DTO, so the frontend can switch on
   * {@link type} and cast the payload to the matching shape.
   */
  readonly payload: LowStockReachedPayload | Record<string, unknown>;
  readonly createdAt: string;
  readonly readAt: string | null;
}

/** Spring Data `Page<NotificationResponseDto>` wire shape. */
export interface NotificationPage {
  readonly content: readonly Notification[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly size: number;
  readonly number: number;
  readonly first: boolean;
  readonly last: boolean;
}

/** Query parameters accepted by `GET /api/v1/notifications`. */
export interface NotificationPageQuery {
  readonly page?: number;
  readonly limit?: number;
  /** When `true`, narrows the result set to `read_at is null`. Drives the bell dropdown. */
  readonly onlyUnread?: boolean;
}
