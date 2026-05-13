import { isProblemDetail } from './problem-detail.types';

describe('isProblemDetail', () => {
  it('accepts a well-formed ProblemDetail body returned by the backend', () => {
    const body = {
      title: 'Error interno del servicio',
      status: 500,
      instance: '/api/v1/users/login',
      code: 'error.internal',
      detail: 'Ocurrio un error interno inesperado.',
      traceId: '99ce9efec5e0439588be9740aa418c75',
    };
    expect(isProblemDetail(body)).toBe(true);
  });

  it('rejects null and primitive values', () => {
    expect(isProblemDetail(null)).toBe(false);
    expect(isProblemDetail(undefined)).toBe(false);
    expect(isProblemDetail('error')).toBe(false);
    expect(isProblemDetail(500)).toBe(false);
  });

  it('rejects objects missing any required field', () => {
    expect(isProblemDetail({ title: 't', status: 500, instance: '/x' })).toBe(false);
    expect(isProblemDetail({ status: 500, instance: '/x', code: 'c' })).toBe(false);
  });

  it('rejects objects with wrong-typed fields', () => {
    expect(isProblemDetail({ title: 'x', status: '500', instance: '/x', code: 'c' })).toBe(false);
  });
});
