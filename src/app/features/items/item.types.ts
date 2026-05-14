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
}
