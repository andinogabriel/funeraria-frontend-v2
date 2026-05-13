import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { AffiliateService } from './affiliate.service';
import type { AffiliateRequest } from './affiliate.types';

describe('AffiliateService', () => {
  let service: AffiliateService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AffiliateService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function wireAffiliate(
    overrides: Partial<Record<string, unknown>> = {},
  ): Record<string, unknown> {
    return {
      firstName: 'Juan',
      lastName: 'Gomez',
      dni: 35123456,
      birthDate: '10-08-1984',
      startDate: '17-04-2026',
      deceased: false,
      gender: { id: 2, name: 'Masculino' },
      relationship: { id: 1, name: 'Padre' },
      ...overrides,
    };
  }

  function request(overrides: Partial<AffiliateRequest> = {}): AffiliateRequest {
    return {
      firstName: 'Juan',
      lastName: 'Gomez',
      dni: 35123456,
      birthDate: '1984-08-10',
      gender: { id: 2, name: 'Masculino' },
      relationship: { id: 1, name: 'Padre' },
      ...overrides,
    };
  }

  it('normalises legacy dd-MM-yyyy dates to ISO yyyy-MM-dd on read', () => {
    service.loadActive().subscribe();
    http.expectOne('/api/v1/affiliates').flush([wireAffiliate()]);

    const list = service.list();
    expect(list).toHaveLength(1);
    expect(list?.[0].birthDate).toBe('1984-08-10');
    expect(list?.[0].startDate).toBe('2026-04-17');
  });

  it('exposes loading + cleared error during a successful load, populates the list signal', () => {
    service.loadActive().subscribe();
    expect(service.loading()).toBe(true);
    expect(service.list()).toBeNull();

    http
      .expectOne('/api/v1/affiliates')
      .flush([wireAffiliate(), wireAffiliate({ dni: 30111222, firstName: 'Maria' })]);

    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(service.list()).toHaveLength(2);
    expect(service.empty()).toBe(false);
  });

  it('reports a Spanish error message when the load fails with 403', () => {
    service.loadActive().subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/affiliates')
      .flush(
        { code: 'error.forbidden', title: 'Forbidden', status: 403, instance: '/' },
        { status: 403, statusText: 'Forbidden' },
      );

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No tenés permiso para ver el listado de afiliados.');
  });

  it('findByDni returns the cached affiliate when present and undefined otherwise', () => {
    service.loadActive().subscribe();
    http.expectOne('/api/v1/affiliates').flush([wireAffiliate({ dni: 35123456 })]);

    expect(service.findByDni(35123456)?.firstName).toBe('Juan');
    expect(service.findByDni(99999999)).toBeUndefined();
  });

  it('search hits /api/v1/affiliates/search with a `value` query param and normalises dates', () => {
    let result: ReturnType<typeof service.list> | undefined;
    service.search('gomez').subscribe((value) => (result = value));

    const req = http.expectOne((r) => r.url === '/api/v1/affiliates/search');
    expect(req.request.params.get('value')).toBe('gomez');
    req.flush([wireAffiliate()]);

    expect(result?.[0].birthDate).toBe('1984-08-10');
    // search MUST NOT pollute the cached active list.
    expect(service.list()).toBeNull();
  });

  it('create POSTs the request payload and refetches the active list on success', () => {
    service.create(request()).subscribe();

    const createReq = http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/affiliates');
    expect(createReq.request.body.dni).toBe(35123456);
    createReq.flush(wireAffiliate());

    const refetch = http.expectOne((r) => r.method === 'GET' && r.url === '/api/v1/affiliates');
    refetch.flush([wireAffiliate()]);
    expect(service.list()).toHaveLength(1);
  });

  it('update PUTs to /affiliates/{dni} and refetches the active list', () => {
    service.update(35123456, request({ firstName: 'Updated' })).subscribe();

    const updateReq = http.expectOne(
      (r) => r.method === 'PUT' && r.url === '/api/v1/affiliates/35123456',
    );
    expect(updateReq.request.body.firstName).toBe('Updated');
    updateReq.flush(wireAffiliate({ firstName: 'Updated' }));

    http.expectOne('/api/v1/affiliates').flush([wireAffiliate({ firstName: 'Updated' })]);
    expect(service.list()?.[0].firstName).toBe('Updated');
  });

  it('delete DELETEs /affiliates/{dni} and refetches the active list', () => {
    service.delete(35123456).subscribe();

    const delReq = http.expectOne(
      (r) => r.method === 'DELETE' && r.url === '/api/v1/affiliates/35123456',
    );
    delReq.flush(null);

    http.expectOne('/api/v1/affiliates').flush([]);
    expect(service.empty()).toBe(true);
  });
});
