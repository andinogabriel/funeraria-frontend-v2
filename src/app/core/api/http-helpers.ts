import { HttpParams } from '@angular/common/http';

import type { PageRequest } from './pagination.types';

/**
 * Builds an `HttpParams` value from a sparse object. Keys whose value is `null`, `undefined`
 * or an empty string are dropped silently so callers can pass a single object with every
 * possible filter and not have to gate each one with an `if (value !== undefined)`. Array
 * values append one repetition per element, matching Spring's `MultiValueMap` decoding
 * convention.
 *
 * This is the canonical way to build query strings in this app — manual `?a=1&b=2`
 * concatenation is forbidden because it sidesteps URL-encoding and is the canonical source
 * of "the param disappeared in production" bugs.
 */
export function toQueryParams(values: QueryParamInput): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item === null || item === undefined || item === '') {
          continue;
        }
        params = params.append(key, String(item));
      }
      continue;
    }
    if (value === '') {
      continue;
    }
    params = params.append(key, String(value));
  }
  return params;
}

/**
 * Convenience overload that merges a {@link PageRequest} with arbitrary feature-specific
 * filters into a single `HttpParams` value. The page request is spread first, so a feature
 * filter named `page` or `size` would override the pagination — that is deliberate and
 * matches the underlying object-merge semantics; just don't name filter fields after
 * pagination keys.
 */
export function toPageQueryParams(page: PageRequest, filters: QueryParamInput = {}): HttpParams {
  return toQueryParams({
    page: page.page,
    size: page.size,
    sort: page.sort ?? [],
    ...filters,
  });
}

type QueryParamPrimitive = string | number | boolean | null | undefined;
export type QueryParamInput = Record<string, QueryParamPrimitive | readonly QueryParamPrimitive[]>;
