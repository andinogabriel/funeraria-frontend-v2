import type { FormGroup } from '@angular/forms';

import {
  call,
  configurePage,
  flushAll,
  member,
  read,
  render,
  settle,
  textOf,
  USER,
  type PageHarness,
} from '../../../../testing/page-harness';
import type { TariffConfig } from '../membership.types';
import { TariffPage } from './tariff.page';

const config: TariffConfig = {
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
    { id: 2, minAge: 86, maxAge: null, ageMultiplier: 4, label: '86+', displayOrder: 2 },
  ],
};

describe('TariffPage', () => {
  let h: PageHarness;

  function setup(authorities?: readonly string[]) {
    h = configurePage({ authorities });
    const fixture = render(TariffPage);
    flushAll(h.http, [['/membership/tariff', config]]);
    settle(fixture);
    return fixture;
  }
  const form = (f: ReturnType<typeof setup>) => member<TariffPage, FormGroup>(f, 'form');

  afterEach(() => h.http.verify());

  it('builds the editable form from the tariff', () => {
    const fixture = setup();
    expect(form(fixture).getRawValue().baseAmount).toBe(2000);
    expect(textOf(fixture)).toContain('Tarifario de cuotas');
  });

  it('saves the edited tariff (admin) and reports failures', () => {
    const fixture = setup();
    form(fixture).patchValue({ baseAmount: 2500 });
    call(fixture, 'onSave');
    const put = h.http.match((r) => r.method === 'PUT')[0];
    expect(put.request.body.baseAmount).toBe(2500);
    expect(put.request.body.healthTiers[0].id).toBe(1);
    put.flush({ ...config, baseAmount: 2500 });
    settle(fixture);

    call(fixture, 'onSave');
    h.http
      .match((r) => r.method === 'PUT')[0]
      .flush({ detail: 'inválido' }, { status: 400, statusText: 'Bad Request' });
    settle(fixture);
  });

  it('disables the form for non-admins and refuses to save', () => {
    const fixture = setup(USER);
    expect(form(fixture).disabled).toBe(true);
    call(fixture, 'onSave');
    expect(h.http.match((r) => r.method === 'PUT').length).toBe(0);
  });

  it('quotes insurable and non-insurable applicants', () => {
    const fixture = setup();
    call(fixture, 'onQuote');
    h.http
      .match((r) => r.url.includes('/quote'))[0]
      .flush({
        insurable: true,
        monthlyFee: 2000,
        age: 40,
        ageBandLabel: '18-35',
        healthTierCode: 'STANDARD',
        healthTierName: 'Estándar',
        waitingPeriodMonths: 3,
        reason: null,
      });
    settle(fixture);
    expect(textOf(fixture)).toContain('2.000');
    call(fixture, 'onQuote');
    h.http
      .match((r) => r.url.includes('/quote'))[0]
      .flush({
        insurable: false,
        monthlyFee: null,
        age: 90,
        ageBandLabel: null,
        healthTierCode: 'STANDARD',
        healthTierName: 'Estándar',
        waitingPeriodMonths: null,
        reason: 'NO_AGE_BAND',
      });
    settle(fixture);
    expect(read(fixture, 'quoteResult')).toMatchObject({ insurable: false });
    expect(call(fixture, 'quoteReasonLabel', 'ABOVE_MAX_ISSUE_AGE')).toContain('máximo');
    expect(call(fixture, 'quoteReasonLabel', null)).toBe('No asegurable.');
  });

  it('reports a failed quote', () => {
    const fixture = setup();
    call(fixture, 'onQuote');
    h.http
      .match((r) => r.url.includes('/quote'))[0]
      .flush({ detail: 'tier desconocido' }, { status: 404, statusText: 'Not Found' });
    settle(fixture);
    expect(read(fixture, 'quoteError')).toBe('tier desconocido');
  });
});
