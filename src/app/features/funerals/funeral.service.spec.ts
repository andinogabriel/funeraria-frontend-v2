import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { FuneralService } from './funeral.service';
import type { FuneralRequest } from './funeral.types';

describe('FuneralService', () => {
  let service: FuneralService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(FuneralService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function wireFuneral(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
    return {
      id: 1,
      funeralDate: '20-06-2026 14:30',
      registerDate: '17-05-2026 09:00',
      receiptNumber: 'R-001',
      receiptSeries: '0001',
      tax: 21,
      totalAmount: 250000,
      receiptType: { id: 1, name: 'Egreso' },
      deceased: {
        id: 10,
        firstName: 'Juan',
        lastName: 'Perez',
        dni: 30111222,
        affiliated: true,
        birthDate: '10-05-1950',
        deathDate: '12-05-2026',
        registerDate: '17-05-2026 09:00',
        placeOfDeath: null,
        gender: { id: 2, name: 'Masculino' },
        deceasedRelationship: { id: 1, name: 'Padre' },
        deathCause: { id: 3, name: 'Natural' },
        deceasedUser: null,
      },
      plan: {
        id: 1,
        name: 'Plan oro',
        description: null,
        imageUrl: null,
        price: 200000,
        profitPercentage: 25,
        itemsPlan: [],
      },
      ...overrides,
    };
  }

  function request(overrides: Partial<FuneralRequest> = {}): FuneralRequest {
    return {
      funeralDate: '2026-06-20T14:30:00',
      receiptNumber: null,
      receiptSeries: null,
      tax: null,
      receiptType: null,
      deceased: {
        firstName: 'Juan',
        lastName: 'Perez',
        dni: 30111222,
        birthDate: '1950-05-10',
        deathDate: '2026-05-12',
        placeOfDeath: null,
        gender: { id: 2, name: 'Masculino' },
        deceasedRelationship: { id: 1, name: 'Padre' },
        deathCause: { id: 3, name: 'Natural' },
        deceasedUser: null,
      },
      plan: {
        name: 'Plan oro',
        description: null,
        profitPercentage: 25,
        itemsPlan: [],
      },
      ...overrides,
    };
  }

  it('GETs /api/v1/funerals on loadAll and normalises wire dates to ISO', () => {
    service.loadAll().subscribe();
    expect(service.loading()).toBe(true);

    http.expectOne('/api/v1/funerals').flush([wireFuneral()]);

    const list = service.list();
    expect(list).toHaveLength(1);
    expect(list?.[0].funeralDate).toBe('2026-06-20T14:30');
    expect(list?.[0].registerDate).toBe('2026-05-17T09:00');
    expect(list?.[0].deceased.birthDate).toBe('1950-05-10');
    expect(list?.[0].deceased.deathDate).toBe('2026-05-12');
    expect(service.loading()).toBe(false);
  });

  it('exposes a Spanish error message and clears loading on 403', () => {
    service.loadAll().subscribe({ error: () => undefined });
    http.expectOne('/api/v1/funerals').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No tenés permiso para ver el listado de servicios.');
  });

  it('POSTs on create and appends the normalised response to the cache', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/funerals').flush([wireFuneral({ id: 1 })]);

    service.create(request()).subscribe();
    const createReq = http.expectOne((r) => r.method === 'POST' && r.url === '/api/v1/funerals');
    expect(createReq.request.body.deceased.dni).toBe(30111222);
    createReq.flush(wireFuneral({ id: 99 }));

    // No follow-up GET: cache was patched in place.
    expect(service.list()?.map((f) => f.id)).toEqual([1, 99]);
  });

  it('PUTs on update and replaces the cached row from the response', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/funerals').flush([wireFuneral({ id: 7, receiptNumber: 'old' })]);

    service.update(7, request()).subscribe();
    const putReq = http.expectOne((r) => r.method === 'PUT' && r.url === '/api/v1/funerals/7');
    putReq.flush(wireFuneral({ id: 7, receiptNumber: 'new' }));

    expect(service.list()?.[0].receiptNumber).toBe('new');
  });

  it('DELETEs and removes the row from the cache without refetching', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/funerals').flush([wireFuneral({ id: 7 }), wireFuneral({ id: 8 })]);

    service.delete(7).subscribe();
    http
      .expectOne((r) => r.method === 'DELETE' && r.url === '/api/v1/funerals/7')
      .flush({ name: 'DELETE FUNERAL', result: 'SUCCESSFUL' });

    expect(service.list()?.map((f) => f.id)).toEqual([8]);
  });

  it('findById returns the cached funeral or undefined', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/funerals').flush([wireFuneral({ id: 1 }), wireFuneral({ id: 2 })]);

    expect(service.findById(2)?.id).toBe(2);
    expect(service.findById(999)).toBeUndefined();
  });
});
