import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { IncomeService } from './income.service';

describe('IncomeService', () => {
  let service: IncomeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(IncomeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function wirePage(): Record<string, unknown> {
    return {
      content: [
        {
          receiptNumber: 'A-001',
          receiptSeries: '0001',
          // ISO 8601 with `Z` — matches what the backend ships now that
          // IncomeResponseDto.{incomeDate, lastModifiedDate} are `Instant`.
          incomeDate: '2026-05-17T12:14:00Z',
          lastModifiedDate: '2026-05-17T12:30:00Z',
          tax: 21,
          totalAmount: 125_000,
          receiptType: { id: 1, name: 'Ingreso' },
          supplier: null,
          incomeUser: null,
          lastModifiedBy: {
            email: 'admin@funeraria.local',
            firstName: 'Admin',
            lastName: 'Funeraria',
          },
          incomeDetails: [],
        },
      ],
      totalElements: 42,
      totalPages: 3,
      size: 20,
      number: 1,
      first: false,
      last: false,
    };
  }

  it('GETs /api/v1/incomes/paginated with the supplied page params and normalises dates', () => {
    service.loadPage({ page: 1, limit: 20, sortBy: 'incomeDate', sortDir: 'desc' }).subscribe();
    expect(service.loading()).toBe(true);

    const req = http.expectOne((r) => r.url === '/api/v1/incomes/paginated');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('limit')).toBe('20');
    expect(req.request.params.get('sortBy')).toBe('incomeDate');
    expect(req.request.params.get('sortDir')).toBe('desc');
    req.flush(wirePage());

    expect(service.loading()).toBe(false);
    expect(service.totalElements()).toBe(42);
    expect(service.rows()).toHaveLength(1);
    // The service passes the ISO timestamps through verbatim — display helpers
    // call `new Date(iso)` so the wire string keeps the canonical UTC `Z` form.
    expect(service.rows()[0].incomeDate).toBe('2026-05-17T12:14:00Z');
    expect(service.rows()[0].lastModifiedDate).toBe('2026-05-17T12:30:00Z');
  });

  it('omits the optional query params when the caller leaves them undefined', () => {
    service.loadPage().subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/incomes/paginated');
    expect(req.request.params.keys().length).toBe(0);
    req.flush(wirePage());
  });

  it('forwards receiptNumber / supplierNif / from / to onto the request when present', () => {
    service
      .loadPage({
        page: 0,
        limit: 20,
        receiptNumber: '  1001  ',
        supplierNif: '30-12345678-9',
        from: '2026-05-01',
        to: '2026-05-31',
      })
      .subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/incomes/paginated');
    // Trim happens inside the service so the URL stays clean.
    expect(req.request.params.get('receiptNumber')).toBe('1001');
    expect(req.request.params.get('supplierNif')).toBe('30-12345678-9');
    expect(req.request.params.get('from')).toBe('2026-05-01');
    expect(req.request.params.get('to')).toBe('2026-05-31');
    req.flush(wirePage());
  });

  it('drops blank filter strings (e.g. empty receipt search) so the URL stays clean', () => {
    service.loadPage({ page: 0, receiptNumber: '   ', supplierNif: '' }).subscribe();
    const req = http.expectOne((r) => r.url === '/api/v1/incomes/paginated');
    expect(req.request.params.has('receiptNumber')).toBe(false);
    expect(req.request.params.has('supplierNif')).toBe(false);
    req.flush(wirePage());
  });

  it('exposes a friendly Spanish error and clears loading on 403', () => {
    service.loadPage().subscribe({ error: () => undefined });
    http
      .expectOne((r) => r.url === '/api/v1/incomes/paginated')
      .flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No tenés permiso para administrar ingresos.');
  });

  it('encodes the receipt number for findByReceiptNumber / update / delete', () => {
    service.findByReceiptNumber('A/001 02').subscribe();
    http
      .expectOne((r) => r.method === 'GET' && r.url === '/api/v1/incomes/A%2F001%2002')
      .flush({
        receiptNumber: 'A/001 02',
        receiptSeries: '0001',
        incomeDate: '17-05-2026 09:14',
        tax: 21,
        totalAmount: 0,
        receiptType: null,
        supplier: null,
        incomeUser: null,
        incomeDetails: [],
      });
  });
});
