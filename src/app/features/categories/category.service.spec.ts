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

  it('DELETEs /api/v1/categories/{id} on delete and refetches', () => {
    service.delete(3).subscribe();
    http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/v1/categories/3').flush(null);
    http.expectOne('/api/v1/categories').flush([]);
  });
});
