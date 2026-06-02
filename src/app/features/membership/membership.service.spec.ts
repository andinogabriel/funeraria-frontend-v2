import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { MembershipService } from './membership.service';
import type { FeeQuote, TariffConfig } from './membership.types';

describe('MembershipService', () => {
  let service: MembershipService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(MembershipService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function config(): TariffConfig {
    return {
      baseAmount: 2000,
      maxIssueAge: 85,
      overdueGraceCount: 2,
      healthTiers: [
        {
          id: 1,
          code: 'STANDARD',
          name: 'Estándar',
          healthMultiplier: 1,
          waitingPeriodMonths: 3,
          displayOrder: 1,
        },
      ],
      ageBands: [
        { id: 1, minAge: 18, maxAge: 35, ageMultiplier: 1, label: '18-35', displayOrder: 1 },
      ],
    };
  }

  it('GETs the tariff config and exposes it through the signal', () => {
    service.loadConfig().subscribe();
    http.expectOne('/api/v1/membership/tariff').flush(config());

    expect(service.config()).toEqual(config());
    expect(service.loading()).toBe(false);
  });

  it('PUTs the edit and replaces the cached config with the server echo', () => {
    const updated = { ...config(), baseAmount: 2500 };
    let received: TariffConfig | undefined;
    service
      .updateConfig({
        baseAmount: 2500,
        maxIssueAge: 85,
        overdueGraceCount: 2,
        healthTiers: [{ id: 1, name: 'Estándar', healthMultiplier: 1, waitingPeriodMonths: 3 }],
        ageBands: [{ id: 1, ageMultiplier: 1, label: '18-35' }],
      })
      .subscribe((c) => (received = c));

    const req = http.expectOne('/api/v1/membership/tariff');
    expect(req.request.method).toBe('PUT');
    req.flush(updated);

    expect(received).toEqual(updated);
    expect(service.config()).toEqual(updated);
  });

  it('GETs a quote with age + healthTier params', () => {
    const quote: FeeQuote = {
      insurable: true,
      monthlyFee: 3600,
      age: 55,
      ageBandLabel: '51-65',
      healthTierCode: 'STANDARD',
      healthTierName: 'Estándar',
      waitingPeriodMonths: 3,
      reason: null,
    };
    let received: FeeQuote | undefined;
    service.quote(55, 'STANDARD').subscribe((q) => (received = q));

    const req = http.expectOne(
      (r) =>
        r.url === '/api/v1/membership/tariff/quote' &&
        r.params.get('age') === '55' &&
        r.params.get('healthTier') === 'STANDARD',
    );
    req.flush(quote);

    expect(received).toEqual(quote);
  });

  it('reports a friendly Spanish error on 403', () => {
    service.loadConfig().subscribe({ error: () => undefined });
    http
      .expectOne('/api/v1/membership/tariff')
      .flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.error()).toBe('No tenés permiso para administrar el tarifario.');
  });
});
