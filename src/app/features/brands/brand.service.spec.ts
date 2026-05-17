import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { BrandService } from './brand.service';
import type { Brand } from './brand.types';

describe('BrandService', () => {
  let service: BrandService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BrandService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const brand: Brand = { id: 1, name: 'ACME', webPage: null };

  it('GETs /api/v1/brands on loadAll and populates the list signal', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/brands').flush([brand]);
    expect(service.list()).toEqual([brand]);
  });

  it('PUTs to /api/v1/brands/{id} on update and patches the cached row from the response', () => {
    // Seed the cache so the update tap has a list to patch.
    service.loadAll().subscribe();
    const stale: Brand = { id: 7, name: 'old', webPage: null };
    http.expectOne('/api/v1/brands').flush([stale]);

    const updated: Brand = { id: 7, name: 'new', webPage: 'https://example.com' };
    service.update(7, { name: 'new', webPage: 'https://example.com' }).subscribe();
    http.expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/brands/7').flush(updated);
    // No second GET — the cache should be patched in place from the PUT response.
    expect(service.list()).toEqual([updated]);
  });

  it('POSTs on create and appends the response to the cached list', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/brands').flush([brand]);

    const created: Brand = { id: 2, name: 'Beta', webPage: null };
    service.create({ name: 'Beta', webPage: null }).subscribe();
    http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/brands').flush(created);
    expect(service.list()).toEqual([brand, created]);
  });

  it('DELETEs and removes the row from the cached list without refetching', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/brands').flush([brand]);

    service.delete(brand.id).subscribe();
    http
      .expectOne((r) => r.method === 'DELETE' && r.url === `/api/v1/brands/${brand.id}`)
      .flush(null);
    expect(service.list()).toEqual([]);
  });

  it('reports a friendly error and resets loading on 403', () => {
    service.loadAll().subscribe({ error: () => undefined });
    http.expectOne('/api/v1/brands').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No tenés permiso para realizar esta acción sobre marcas.');
  });
});
