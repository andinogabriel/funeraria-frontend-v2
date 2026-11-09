import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { formatArs, formatIsoDate, formatPeriod } from './billing.types';
import { MembershipBillingService } from './membership-billing.service';

describe('membership billing helpers', () => {
  it('formats pesos, periods and ISO dates for the desk', () => {
    expect(formatArs(2600)).toContain('2.600');
    expect(formatPeriod('2026-11')).toMatch(/noviembre.*2026/);
    expect(formatIsoDate('2026-11-10')).toBe('10/11/2026');
  });
});

describe('MembershipBillingService', () => {
  let service: MembershipBillingService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MembershipBillingService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('calls the billing endpoints', () => {
    service.statement(20111222).subscribe();
    expect(
      http.expectOne((r) => r.url.endsWith('/v1/membership/holders/20111222/account')).request
        .method,
    ).toBe('GET');

    service
      .registerPayment(20111222, { amount: 10, paidOn: '2026-11-09', method: 'CASH' })
      .subscribe();
    const pay = http.expectOne((r) => r.url.endsWith('/holders/20111222/payments'));
    expect(pay.request.method).toBe('POST');

    service.generateDues('2026-11').subscribe();
    expect(http.expectOne((r) => r.url.endsWith('/dues/generate')).request.body).toEqual({
      period: '2026-11',
    });

    service.searchHolders('rosa').subscribe();
    expect(
      http.expectOne((r) => r.url.endsWith('/membership/holders')).request.params.get('search'),
    ).toBe('rosa');
  });
});
