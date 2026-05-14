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

  it('PUTs to /api/v1/brands/{id} on update and refetches', () => {
    service.update(7, { name: 'X', webPage: null }).subscribe();
    http.expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/brands/7').flush(brand);
    http.expectOne('/api/v1/brands').flush([brand]);
  });

  it('reports a friendly error and resets loading on 403', () => {
    service.loadAll().subscribe({ error: () => undefined });
    http.expectOne('/api/v1/brands').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No tenés permiso para realizar esta acción sobre marcas.');
  });
});
