/** Mirrors `BrandResponseDto` / `BrandRequestDto` one-to-one. */
export interface Brand {
  readonly id: number;
  readonly name: string;
  readonly webPage: string | null;
}

export interface BrandRequest {
  readonly id?: number;
  readonly name: string;
  readonly webPage: string | null;
}
