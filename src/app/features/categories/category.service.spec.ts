import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { CategoryService } from './category.service';
import type { Category } from './category.types';

describe('CategoryService', () => {
  let service: CategoryService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CategoryService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  const category: Category = { id: 1, name: 'Cajones', description: null };

  it('GETs /api/v1/categories on loadAll and populates the list signal', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/categories').flush([category]);
    expect(service.list()).toEqual([category]);
  });

  it('DELETEs /api/v1/categories/{id} and removes the row from the cached list', () => {
    service.loadAll().subscribe();
    const other: Category = { id: 5, name: 'Coronas', description: null };
    http.expectOne('/api/v1/categories').flush([category, other]);

    service.delete(category.id).subscribe();
    http
      .expectOne((r) => r.method === 'DELETE' && r.url === `/api/v1/categories/${category.id}`)
      .flush(null);
    // No second GET: the cache patch removes the row in place.
    expect(service.list()).toEqual([other]);
  });

  it('PUTs on update and patches the cached row from the response', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/categories').flush([category]);

    const updated: Category = { id: category.id, name: 'Cajones premium', description: null };
    service.update(category.id, { name: 'Cajones premium', description: null }).subscribe();
    http
      .expectOne((r) => r.method === 'PUT' && r.url === `/api/v1/categories/${category.id}`)
      .flush(updated);
    expect(service.list()).toEqual([updated]);
  });

  it('POSTs on create and appends the response to the cached list', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/categories').flush([category]);

    const created: Category = { id: 9, name: 'Urnas', description: null };
    service.create({ name: 'Urnas', description: null }).subscribe();
    http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/categories').flush(created);
    expect(service.list()).toEqual([category, created]);
  });
});
