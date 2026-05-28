/**
 * Transport types for the item slice — mirrors `ItemRequestDto` and `ItemResponseDto`
 * one-to-one. The backend uses `code` as the natural key on every read endpoint
 * (`GET /items/{code}`, `PUT /items/{code}`, `DELETE /items/{code}`); we keep that
 * convention on the client so the plan form picker can resolve items by code
 * without an extra catalog lookup.
 */

import type { Brand } from '../brands/brand.types';
import type { Category } from '../categories/category.types';

/** Item record returned by `GET /api/v1/items` and the mutation endpoints. */
export interface Item {
  /** Auto-incrementing primary key. Useful for sending back to the server in references. */
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
  /** Natural key — unique across the catalog. The backend uses it as the path variable. */
  readonly code: string;
  readonly price: number;
  readonly itemLength: number | null;
  readonly itemHeight: number | null;
  readonly itemWidth: number | null;
  readonly stock: number | null;
  readonly itemImageLink: string | null;
  readonly brand: Brand | null;
  readonly category: Category | null;
  /** Audit fields populated by Spring Data JPA's `AuditingEntityListener`. */
  readonly createdAt: string;
  readonly createdBy: string | null;
  readonly updatedAt: string | null;
  readonly updatedBy: string | null;
  /**
   * Stock floor that drives the (future) low-stock alert (PR5a / PR5b). Always
   * present on the wire — the backend column carries `NOT NULL DEFAULT 10`.
   */
  readonly lowStockThreshold: number;
  /**
   * UTC instant the item was soft-deleted. Only populated by the admin papelera
   * endpoint (`GET /api/v1/items/deleted`); backend strips the field from active
   * responses via `@JsonInclude(NON_DEFAULT)`.
   */
  readonly deletedAt?: string;
  /** Email of the admin that requested the soft-delete. Same scope as `deletedAt`. */
  readonly deletedBy?: string;
}

/** Request body for `POST /api/v1/items` and `PUT /api/v1/items/{code}`. */
export interface ItemRequest {
  readonly id?: number;
  readonly name: string;
  readonly description: string | null;
  readonly code: string;
  readonly price: number;
  readonly itemLength: number | null;
  readonly itemHeight: number | null;
  readonly itemWidth: number | null;
  readonly brand: Brand | null;
  readonly category: Category | null;
  /**
   * Optional on the wire — leave undefined when the form does not want to touch
   * the threshold (PUT semantics: backend's MapStruct skips null source on
   * update; POST falls back to the default 10).
   */
  readonly lowStockThreshold?: number | null;
}

/** Server-side paginated response — Spring Data `Page<ItemResponseDto>`. */
export interface ItemPage {
  readonly content: readonly Item[];
  readonly totalElements: number;
  readonly totalPages: number;
  readonly size: number;
  readonly number: number;
  readonly first: boolean;
  readonly last: boolean;
}

/** Query parameters accepted by `GET /api/v1/items/paginated`. */
export interface ItemPageQuery {
  readonly page?: number;
  readonly limit?: number;
  readonly sortBy?: string;
  readonly sortDir?: 'asc' | 'desc';
  /** Case-insensitive substring against the item code. */
  readonly code?: string;
  /** Case-insensitive substring against the item name. */
  readonly name?: string;
  /** Exact match on the linked category's name (frontend autocomplete commit). */
  readonly categoryName?: string;
  /** Exact match on the linked brand's name (frontend autocomplete commit). */
  readonly brandName?: string;
}

/**
 * Query parameters accepted by `GET /api/v1/items/deleted` — the admin papelera
 * surface. Empty / undefined fields are dropped from the URL by the service so the
 * backend sees the "no filter" sentinel for each absent param.
 */
export interface ItemBinPageQuery {
  readonly page?: number;
  readonly limit?: number;
  /** Case-insensitive substring against the item code. */
  readonly code?: string;
  /** Case-insensitive substring against the item name. */
  readonly name?: string;
  /** Exact match on the linked category's name. */
  readonly categoryName?: string;
  /** Exact match on the linked brand's name. */
  readonly brandName?: string;
  /** Case-insensitive substring against the admin email captured at delete time. */
  readonly deletedBy?: string;
  /** Inclusive lower bound on `deletedAt`, ISO-8601 UTC instant. */
  readonly deletedFrom?: string;
  /** Inclusive upper bound on `deletedAt`, ISO-8601 UTC instant. */
  readonly deletedTo?: string;
}
