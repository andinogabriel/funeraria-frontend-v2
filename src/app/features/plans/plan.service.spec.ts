import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { PlanService } from './plan.service';
import type { Plan, PlanRequest } from './plan.types';

describe('PlanService', () => {
  let service: PlanService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(PlanService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function plan(overrides: Partial<Plan> = {}): Plan {
    return {
      id: 1,
      name: 'Plan oro',
      description: 'Plan completo',
      imageUrl: null,
      price: 100_000,
      profitPercentage: 25,
      itemsPlan: [],
      ...overrides,
    };
  }

  function request(overrides: Partial<PlanRequest> = {}): PlanRequest {
    return {
      name: 'Plan oro',
      description: 'Plan completo',
      profitPercentage: 25,
      itemsPlan: [{ item: { id: 1, name: 'Cajón', code: 'CAJ-001' }, quantity: 1 }],
      ...overrides,
    };
  }

  it('GETs /api/v1/plans on loadAll and exposes the result through the list signal', () => {
    service.loadAll().subscribe();
    expect(service.loading()).toBe(true);

    const req = http.expectOne('/api/v1/plans');
    expect(req.request.method).toBe('GET');
    const payload = [plan(), plan({ id: 2, name: 'Plan plata' })];
    req.flush(payload);

    expect(service.loading()).toBe(false);
    expect(service.list()).toEqual(payload);
    expect(service.error()).toBeNull();
  });

  it('reports a friendly error and resets loading when loadAll fails', () => {
    service.loadAll().subscribe({ error: () => undefined });
    const req = http.expectOne('/api/v1/plans');
    req.error(new ProgressEvent('error'), { status: 0, statusText: '' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No se pudo contactar al servidor.');
  });

  it('POSTs the request body to /api/v1/plans on create and refetches the list afterwards', () => {
    service.create(request()).subscribe();

    const createReq = http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/plans');
    expect(createReq.request.body).toEqual(request());
    createReq.flush(plan());

    const refetch = http.expectOne('/api/v1/plans');
    expect(refetch.request.method).toBe('GET');
    refetch.flush([plan()]);
  });

  it('PUTs to /api/v1/plans/{id} on update and refetches the list', () => {
    service.update(7, request()).subscribe();

    const putReq = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/plans/7');
    expect(putReq.request.body).toEqual(request());
    putReq.flush(plan({ id: 7 }));

    http.expectOne('/api/v1/plans').flush([plan({ id: 7 })]);
  });

  it('DELETEs /api/v1/plans/{id} on delete and refetches the list', () => {
    service.delete(7).subscribe();

    const delReq = http.expectOne((r) => r.method === 'DELETE' && r.url === '/api/v1/plans/7');
    delReq.flush(null);

    http.expectOne('/api/v1/plans').flush([]);
  });

  it('findById returns the matching plan from the cached list', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/plans').flush([plan({ id: 1 }), plan({ id: 2, name: 'Plan plata' })]);

    expect(service.findById(2)?.name).toBe('Plan plata');
    expect(service.findById(99)).toBeUndefined();
  });
});
