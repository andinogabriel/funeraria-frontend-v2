import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { ReportService } from './report.service';
import type { DailyReport } from './report.types';

describe('ReportService', () => {
  let service: ReportService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function payload(): DailyReport {
    return {
      date: '2026-05-30',
      services: {
        count: 3,
        total: 1500000,
        lines: [
          {
            receiptNumber: 'F-99121',
            deceasedName: 'Carlos Gómez',
            planName: '[TEST] Plan Premium',
            amount: 1500000,
          },
        ],
      },
      purchases: {
        count: 2,
        total: 420000,
        annulledCount: 1,
        lines: [
          {
            receiptNumber: '99301',
            supplierName: 'Florestanía Mayorista',
            amount: 420000,
            status: 'ACTIVE',
            reversal: false,
          },
        ],
      },
      net: 1080000,
    };
  }

  it('GETs /api/v1/reports/daily with the date param and exposes the report through the signal', () => {
    service.loadDaily('2026-05-30').subscribe();
    expect(service.loading()).toBe(true);

    const req = http.expectOne((r) => r.url === '/api/v1/reports/daily');
    expect(req.request.params.get('date')).toBe('2026-05-30');
    req.flush(payload());

    expect(service.loading()).toBe(false);
    expect(service.report()).toEqual(payload());
    expect(service.error()).toBeNull();
  });

  it('reports a friendly Spanish error and clears loading on 403', () => {
    service.loadDaily('2026-05-30').subscribe({ error: () => undefined });
    http
      .expectOne((r) => r.url === '/api/v1/reports/daily')
      .flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No tenés permiso para ver los reportes.');
  });

  it('reports a network-down message on status 0', () => {
    service.loadDaily('2026-05-30').subscribe({ error: () => undefined });
    http
      .expectOne((r) => r.url === '/api/v1/reports/daily')
      .error(new ProgressEvent('error'), { status: 0, statusText: '' });

    expect(service.error()).toBe('No se pudo contactar al servidor.');
  });

  it('surfaces the backend ProblemDetail detail on an unmapped status', () => {
    service.loadDaily('2026-05-30').subscribe({ error: () => undefined });
    http
      .expectOne((r) => r.url === '/api/v1/reports/daily')
      .flush({ detail: 'Algo salió mal en el servidor.' }, { status: 500, statusText: 'Error' });

    expect(service.error()).toBe('Algo salió mal en el servidor.');
  });
});
