import { toPageQueryParams, toQueryParams } from './http-helpers';
import type { PageRequest } from './pagination.types';

describe('toQueryParams', () => {
  it('drops null, undefined and empty-string values', () => {
    const params = toQueryParams({ a: 1, b: null, c: undefined, d: '', e: 'ok' });
    expect(params.keys().sort()).toEqual(['a', 'e']);
    expect(params.get('a')).toBe('1');
    expect(params.get('e')).toBe('ok');
  });

  it('serializes booleans and numbers', () => {
    const params = toQueryParams({ flag: true, count: 0 });
    expect(params.get('flag')).toBe('true');
    expect(params.get('count')).toBe('0');
  });

  it('appends one repetition per array element and skips empty entries inside arrays', () => {
    const params = toQueryParams({ sort: ['name,asc', '', 'id,desc'] });
    expect(params.getAll('sort')).toEqual(['name,asc', 'id,desc']);
  });
});

describe('toPageQueryParams', () => {
  function pageRequest(overrides: Partial<PageRequest> = {}): PageRequest {
    return { page: 0, size: 25, ...overrides };
  }

  it('flattens page, size and an empty sort array into a clean query string', () => {
    const params = toPageQueryParams(pageRequest());
    expect(params.get('page')).toBe('0');
    expect(params.get('size')).toBe('25');
    expect(params.has('sort')).toBe(false);
  });

  it('appends one repetition per sort directive', () => {
    const params = toPageQueryParams(pageRequest({ sort: ['occurredAt,desc', 'id,desc'] }));
    expect(params.getAll('sort')).toEqual(['occurredAt,desc', 'id,desc']);
  });

  it('merges optional filters and drops the absent ones', () => {
    const params = toPageQueryParams(pageRequest(), {
      action: 'USER_ROLE_GRANTED',
      targetType: undefined,
      targetId: '',
      actorEmail: 'admin@example.com',
    });
    expect(params.keys().sort()).toEqual(['action', 'actorEmail', 'page', 'size']);
    expect(params.get('action')).toBe('USER_ROLE_GRANTED');
    expect(params.get('actorEmail')).toBe('admin@example.com');
  });
});
