import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ItemService } from './item.service';
import type { Item, ItemRequest } from './item.types';

describe('ItemService', () => {
  let service: ItemService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ItemService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function item(overrides: Partial<Item> = {}): Item {
    return {
      id: 1,
      name: 'Cajón estándar',
      description: null,
      code: 'CAJ-001',
      price: 50_000,
      itemLength: null,
      itemHeight: null,
      itemWidth: null,
      stock: null,
      itemImageLink: null,
      brand: null,
      category: null,
      createdAt: '2026-05-01T10:00:00Z',
      createdBy: 'admin@funeraria.local',
      updatedAt: null,
      updatedBy: null,
      ...overrides,
    };
  }

  function request(overrides: Partial<ItemRequest> = {}): ItemRequest {
    return {
      name: 'Cajón estándar',
      description: null,
      code: 'CAJ-001',
      price: 50_000,
      itemLength: null,
      itemHeight: null,
      itemWidth: null,
      brand: null,
      category: null,
      ...overrides,
    };
  }

  it('GETs /api/v1/items on loadAll and exposes the result through the list signal', () => {
    service.loadAll().subscribe();
    expect(service.loading()).toBe(true);

    const req = http.expectOne('/api/v1/items');
    expect(req.request.method).toBe('GET');
    const payload = [item(), item({ id: 2, code: 'URN-001', name: 'Urna' })];
    req.flush(payload);

    expect(service.loading()).toBe(false);
    expect(service.list()).toEqual(payload);
    expect(service.error()).toBeNull();
  });

  it('uses encodeURIComponent on the code path variable for update', () => {
    service.update('with spaces/and slash', request()).subscribe();
    const putReq = http.expectOne(
      (r) => r.method === 'PUT' && r.url === '/api/v1/items/with%20spaces%2Fand%20slash',
    );
    putReq.flush(item());
    // No follow-up GET: the cache (still null) is left alone.
    http.expectNone('/api/v1/items');
  });

  it('removes the row from the cached list on delete without refetching', () => {
    service.loadAll().subscribe();
    http
      .expectOne('/api/v1/items')
      .flush([item({ code: 'CAJ-001' }), item({ id: 2, code: 'URN-001' })]);

    service.delete('CAJ-001').subscribe();
    http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/v1/items/CAJ-001').flush(null);
    expect(service.list()?.map((i) => i.code)).toEqual(['URN-001']);
  });

  it('replaces the cached row on update by code', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/items').flush([item({ code: 'CAJ-001', name: 'Old' })]);

    const updated = item({ code: 'CAJ-001', name: 'New' });
    service.update('CAJ-001', request({ name: 'New' })).subscribe();
    http.expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/items/CAJ-001').flush(updated);
    expect(service.list()).toEqual([updated]);
  });

  it('appends the response to the cached list on create', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/items').flush([item({ code: 'CAJ-001' })]);

    const created = item({ id: 2, code: 'URN-001', name: 'Urna' });
    service.create(request({ code: 'URN-001', name: 'Urna' })).subscribe();
    http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/items').flush(created);
    expect(service.list()?.map((i) => i.code)).toEqual(['CAJ-001', 'URN-001']);
  });

  it('findByCode returns the matching item from the cached list', () => {
    service.loadAll().subscribe();
    http
      .expectOne('/api/v1/items')
      .flush([item({ code: 'CAJ-001' }), item({ id: 2, code: 'URN-001' })]);

    expect(service.findByCode('URN-001')?.id).toBe(2);
    expect(service.findByCode('xxx')).toBeUndefined();
  });
});
