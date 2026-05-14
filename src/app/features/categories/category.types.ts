/** Mirrors `CategoryResponseDto` / `CategoryRequestDto` one-to-one. */
export interface Category {
  readonly id: number;
  readonly name: string;
  readonly description: string | null;
}

export interface CategoryRequest {
  readonly id?: number;
  readonly name: string;
  readonly description: string | null;
}
