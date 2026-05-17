/**
 * Transport types for the suppliers (proveedores) slice. Mirrors `SupplierRequestDto` and
 * `SupplierResponseDto` on the backend one-to-one. The `nif` field is the natural key —
 * once a supplier is saved we never change it (immutable identifier on edit), same pattern
 * as `code` on items.
 */

import type { City } from '../catalogs/catalogs.types';

/** Mobile-number entry attached to a supplier. */
export interface MobileNumber {
  readonly id?: number;
  readonly mobileNumber: string;
}

/** Address shape on the wire — request side (city by id) and response side (city embedded). */
export interface SupplierAddressRequest {
  readonly id?: number;
  readonly streetName: string;
  readonly blockStreet?: number;
  readonly apartment?: string;
  readonly flat?: string;
  readonly city: { readonly id: number; readonly name?: string };
}

export interface SupplierAddressResponse {
  readonly id?: number;
  readonly streetName?: string;
  readonly blockStreet?: number;
  readonly apartment?: string;
  readonly flat?: string;
  readonly city?: City;
}

/** Request body for `POST /api/v1/suppliers` and `PUT /api/v1/suppliers/{nif}`. */
export interface SupplierRequest {
  readonly id?: number;
  readonly name: string;
  readonly nif: string;
  readonly webPage: string | null;
  readonly email: string;
  readonly mobileNumbers: readonly MobileNumber[];
  readonly addresses: readonly SupplierAddressRequest[];
}

/** Supplier record returned by `GET /api/v1/suppliers`. */
export interface Supplier {
  readonly name: string;
  readonly nif: string;
  readonly webPage: string | null;
  readonly email: string;
  readonly mobileNumbers: readonly MobileNumber[];
  readonly addresses: readonly SupplierAddressResponse[];
}
