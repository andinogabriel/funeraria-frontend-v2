import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SupplierService } from './supplier.service';
import type { Supplier, SupplierRequest } from './supplier.types';

describe('SupplierService', () => {
  let service: SupplierService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SupplierService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function supplier(overrides: Partial<Supplier> = {}): Supplier {
    return {
      name: 'ACME',
      nif: '30-12345678-9',
      webPage: 'https://acme.example.com',
      email: 'ventas@acme.example.com',
      mobileNumbers: [],
      addresses: [],
      ...overrides,
    };
  }

  function request(overrides: Partial<SupplierRequest> = {}): SupplierRequest {
    return {
      name: 'ACME',
      nif: '30-12345678-9',
      webPage: 'https://acme.example.com',
      email: 'ventas@acme.example.com',
      mobileNumbers: [],
      addresses: [],
      ...overrides,
    };
  }

  it('GETs /api/v1/suppliers on loadAll and populates the list signal', () => {
    service.loadAll().subscribe();
    expect(service.loading()).toBe(true);

    http.expectOne('/api/v1/suppliers').flush([supplier()]);

    expect(service.loading()).toBe(false);
    expect(service.list()).toEqual([supplier()]);
  });

  it('reports a Spanish error and clears loading on 403', () => {
    service.loadAll().subscribe({ error: () => undefined });
    http.expectOne('/api/v1/suppliers').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No tenés permiso para administrar proveedores.');
  });

  it('PUTs to /api/v1/suppliers/{nif} on update and patches the cached row in place', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/suppliers').flush([supplier()]);

    const updated = supplier({ name: 'ACME Mayorista' });
    service.update('30-12345678-9', request({ name: 'ACME Mayorista' })).subscribe();
    const putReq = http.expectOne(
      (r) => r.method === 'PUT' && r.url === '/api/v1/suppliers/30-12345678-9',
    );
    putReq.flush(updated);

    expect(service.list()).toEqual([updated]);
  });

  it('uses encodeURIComponent on the NIF path variable for update and delete', () => {
    service.update('CIF B/12-345', request()).subscribe();
    const putReq = http.expectOne(
      (r) => r.method === 'PUT' && r.url === '/api/v1/suppliers/CIF%20B%2F12-345',
    );
    putReq.flush(supplier({ nif: 'CIF B/12-345' }));
  });

  it('POSTs on create and appends the response to the cached list', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/suppliers').flush([supplier({ nif: '20-00000000-0' })]);

    const created = supplier({ nif: '30-12345678-9' });
    service.create(request()).subscribe();
    http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/suppliers').flush(created);

    expect(service.list()?.map((s) => s.nif)).toEqual(['20-00000000-0', '30-12345678-9']);
  });

  it('DELETEs and removes the row from the cache without refetching', () => {
    service.loadAll().subscribe();
    http
      .expectOne('/api/v1/suppliers')
      .flush([supplier({ nif: '20-00000000-0' }), supplier({ nif: '30-12345678-9' })]);

    service.delete('20-00000000-0').subscribe();
    http
      .expectOne((r) => r.method === 'DELETE' && r.url === '/api/v1/suppliers/20-00000000-0')
      .flush(null);

    expect(service.list()?.map((s) => s.nif)).toEqual(['30-12345678-9']);
  });
});
