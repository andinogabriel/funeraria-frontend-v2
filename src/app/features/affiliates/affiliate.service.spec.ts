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

  it('create POSTs the request payload and appends the normalised response to the cache', () => {
    service.loadActive().subscribe();
    http.expectOne('/api/v1/affiliates').flush([wireAffiliate({ dni: 30111222 })]);

    service.create(request()).subscribe();
    const createReq = http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/affiliates');
    expect(createReq.request.body.dni).toBe(35123456);
    createReq.flush(wireAffiliate());

    // No follow-up GET — the cache should have been patched in place.
    expect(service.list()?.map((a) => a.dni)).toEqual([30111222, 35123456]);
  });

  it('update PUTs to /affiliates/{dni} and replaces the cached row from the response', () => {
    service.loadActive().subscribe();
    http.expectOne('/api/v1/affiliates').flush([wireAffiliate({ firstName: 'Old' })]);

    service.update(35123456, request({ firstName: 'Updated' })).subscribe();
    const updateReq = http.expectOne(
      (r) => r.method === 'PUT' && r.url === '/api/v1/affiliates/35123456',
    );
    expect(updateReq.request.body.firstName).toBe('Updated');
    updateReq.flush(wireAffiliate({ firstName: 'Updated' }));

    expect(service.list()?.[0].firstName).toBe('Updated');
  });

  it('update drops the row from the active cache when the response flips deceased = true', () => {
    service.loadActive().subscribe();
    http
      .expectOne('/api/v1/affiliates')
      .flush([wireAffiliate(), wireAffiliate({ dni: 30111222, firstName: 'Maria' })]);

    service.update(35123456, request()).subscribe();
    http
      .expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/affiliates/35123456')
      .flush(wireAffiliate({ deceased: true }));

    expect(service.list()?.map((a) => a.dni)).toEqual([30111222]);
  });

  it('delete DELETEs /affiliates/{dni} and removes the row from the cache without refetching', () => {
    service.loadActive().subscribe();
    http
      .expectOne('/api/v1/affiliates')
      .flush([wireAffiliate(), wireAffiliate({ dni: 30111222, firstName: 'Maria' })]);

    service.delete(35123456).subscribe();
    http
      .expectOne((r) => r.method === 'DELETE' && r.url === '/api/v1/affiliates/35123456')
      .flush(null);

    expect(service.list()?.map((a) => a.dni)).toEqual([30111222]);
  });

  function pageEnvelope(content: readonly Record<string, unknown>[]) {
    return {
      content,
      totalElements: content.length,
      totalPages: 1,
      size: 10,
      number: 0,
      first: true,
      last: true,
    };
  }

  it('loadPage hits /api/v1/affiliates/paginated and exposes the normalised page through pageRows', () => {
    service.loadPage({ page: 0, limit: 10 }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/affiliates/paginated');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('limit')).toBe('10');
    req.flush(pageEnvelope([wireAffiliate()]));

    expect(service.pageRows()).toHaveLength(1);
    expect(service.pageRows()[0].birthDate).toBe('1984-08-10');
    expect(service.totalElements()).toBe(1);
  });

  it('loadPage omits empty filter params from the URL — backend treats absence as the empty-string sentinel', () => {
    // Regression guard: emitting empty strings would defeat the backend's
    // "no filter" short-circuit and force a full table scan.
    service.loadPage({ firstName: '', lastName: '   ', dni: undefined }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/affiliates/paginated');
    expect(req.request.params.has('firstName')).toBe(false);
    expect(req.request.params.has('lastName')).toBe(false);
    expect(req.request.params.has('dni')).toBe(false);
    req.flush(pageEnvelope([]));
  });

  it('loadPage forwards trimmed text filters and date bounds verbatim to the URL', () => {
    service
      .loadPage({
        firstName: '  Juan  ',
        lastName: 'Gomez',
        dni: '351',
        relationshipName: 'Padre',
        from: '1990-01-01',
        to: '2000-12-31',
      })
      .subscribe();

    const req = http.expectOne((r) => r.url === '/api/v1/affiliates/paginated');
    expect(req.request.params.get('firstName')).toBe('Juan');
    expect(req.request.params.get('lastName')).toBe('Gomez');
    expect(req.request.params.get('dni')).toBe('351');
    expect(req.request.params.get('relationshipName')).toBe('Padre');
    expect(req.request.params.get('from')).toBe('1990-01-01');
    expect(req.request.params.get('to')).toBe('2000-12-31');
    req.flush(pageEnvelope([]));
  });

  it('removeFromCachedPage drops the row from the cached page snapshot and decrements totalElements', () => {
    service.loadPage({ page: 0, limit: 10 }).subscribe();
    http
      .expectOne((r) => r.url === '/api/v1/affiliates/paginated')
      .flush(pageEnvelope([wireAffiliate(), wireAffiliate({ dni: 30111222, firstName: 'Maria' })]));
    expect(service.totalElements()).toBe(2);

    service.removeFromCachedPage(35123456);
    expect(service.pageRows().map((a) => a.dni)).toEqual([30111222]);
    expect(service.totalElements()).toBe(1);
  });

  it('update patches the cached paginated snapshot so the list reflects the new value without a refetch', () => {
    service.loadPage({ page: 0, limit: 10 }).subscribe();
    http
      .expectOne((r) => r.url === '/api/v1/affiliates/paginated')
      .flush(pageEnvelope([wireAffiliate({ firstName: 'Old' })]));

    service.update(35123456, request({ firstName: 'Updated' })).subscribe();
    http
      .expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/affiliates/35123456')
      .flush(wireAffiliate({ firstName: 'Updated' }));

    expect(service.pageRows()[0].firstName).toBe('Updated');
  });

  it('update drops the row from the cached page when the response flips deceased = true', () => {
    service.loadPage({ page: 0, limit: 10 }).subscribe();
    http
      .expectOne((r) => r.url === '/api/v1/affiliates/paginated')
      .flush(pageEnvelope([wireAffiliate(), wireAffiliate({ dni: 30111222, firstName: 'Maria' })]));
    expect(service.totalElements()).toBe(2);

    service.update(35123456, request()).subscribe();
    http
      .expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/affiliates/35123456')
      .flush(wireAffiliate({ deceased: true }));

    expect(service.pageRows().map((a) => a.dni)).toEqual([30111222]);
    expect(service.totalElements()).toBe(1);
  });

  it('loadDeletedPage hits /affiliates/deleted and populates the binPage cache with tombstone fields', () => {
    service.loadDeletedPage({ page: 0, limit: 10 }).subscribe();
    const req = http.expectOne((r) => r.method === 'GET' && r.url === '/api/v1/affiliates/deleted');
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('limit')).toBe('10');
    req.flush(
      pageEnvelope([
        wireAffiliate({
          dni: 30111222,
          firstName: 'Maria',
          deletedAt: '2026-05-23T18:42:11Z',
          deletedBy: 'admin@example.com',
        }),
      ]),
    );

    // The active-listing caches stay untouched — the bin is read into its own slot.
    expect(service.binRows()).toHaveLength(1);
    expect(service.binTotalElements()).toBe(1);
    expect(service.pageRows()).toHaveLength(0);
    expect(service.binRows()[0].deletedBy).toBe('admin@example.com');
    expect(service.binRows()[0].deletedAt).toBe('2026-05-23T18:42:11Z');
  });

  it('loadDeletedPage reports a friendly error on 403 without polluting the active caches', () => {
    service.loadDeletedPage().subscribe({ error: () => undefined });
    http
      .expectOne((r) => r.url === '/api/v1/affiliates/deleted')
      .flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.binLoading()).toBe(false);
    expect(service.binError()).toBe('No tenés permiso para ver el listado de afiliados.');
    expect(service.binPage()).toBeNull();
  });
});
