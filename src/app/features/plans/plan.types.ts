/**
 * Transport types for the plan slice. Mirrors `PlanResponseDto` and `PlanRequestDto`
 * one-to-one — keep this file in sync when the backend contract evolves.
 */

/**
 * Single item line inside a plan. Combines a catalog item reference with the quantity
 * the plan bundles. The backend's request DTO accepts `id` OR `code` to identify the
 * item; we send both fields verbatim because the form picker carries them together.
 */
export interface ItemPlanRequest {
  readonly item: {
    readonly id: number;
    readonly name: string;
    readonly code: string;
  };
  readonly quantity: number;
}

/** Same shape as the response from the server (item enriched with description, etc.). */
export interface ItemPlanResponse {
  readonly item: ItemRef;
  readonly quantity: number;
}

/**
 * Subset of `ItemResponseDto` we use on the plan surface. The full item record is
 * served by `/api/v1/items` and surfaced through {@link ItemService}; here we only
 * need the fields that show up in the plan's item list view.
 */
export interface ItemRef {
  readonly name: string;
  readonly description?: string;
  readonly code: string;
  readonly price?: number;
}

/** Request body for `POST /api/v1/plans` and `PUT /api/v1/plans/{id}`. */
export interface PlanRequest {
  readonly id?: number;
  readonly name: string;
  readonly description: string | null;
  readonly profitPercentage: number;
  readonly itemsPlan: readonly ItemPlanRequest[];
}

/** Plan record returned by `GET /api/v1/plans` and the mutation endpoints. */
export interface Plan {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  readonly imageUrl: string | null;
  /** Computed by the backend from `itemsPlan × prices × profitPercentage`. */
  readonly price: number;
  readonly profitPercentage: number;
  readonly itemsPlan: readonly ItemPlanResponse[];
}
