import type { FormGroup } from '@angular/forms';

import { FORM_CATALOGS, inDays } from '../../../../testing/form-catalogs';
import {
  call,
  configurePage,
  flushAll,
  member,
  read,
  render,
  settle,
  type PageHarness,
} from '../../../../testing/page-harness';
import { AffiliateFormPage } from './affiliate-form.page';

describe('AffiliateFormPage', () => {
  let h: PageHarness;

  function setup(mode: 'create' | 'edit', params: Record<string, string> = {}) {
    h = configurePage({ data: { mode }, params });
    const fixture = render(AffiliateFormPage);
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    return fixture;
  }
  const groups = (f: ReturnType<typeof setup>) => ({
    personal: member<AffiliateFormPage, FormGroup>(f, 'personal'),
    classification: member<AffiliateFormPage, FormGroup>(f, 'classification'),
    billing: member<AffiliateFormPage, FormGroup>(f, 'billing'),
  });
  const BILLING = {
    holderDni: 20111222,
    holderFirstName: ' Rosa ',
    holderLastName: 'Gomez',
    holderPhone: '',
    holderEmail: 'rosa@mail.com',
    healthTierCode: 'STANDARD',
  };

  afterEach(() => h.http.verify());

  it('creates an affiliate', () => {
    const fixture = setup('create');
    const g = groups(fixture);
    g.personal.patchValue({
      firstName: 'Ana',
      lastName: 'Gomez',
      dni: 40111299,
      birthDate: inDays(-10000),
    });
    g.classification.patchValue({ genderId: 2, relationshipId: 1 });
    g.billing.patchValue(BILLING);
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    call(fixture, 'onSubmit');
    const post = h.http.match((r) => r.method === 'POST')[0];
    expect(post.request.body.dni).toBe(40111299);
    expect(post.request.body.healthTierCode).toBe('STANDARD');
    // A new affiliate is enrolled today unless the operator back-dates it.
    expect(post.request.body.enrolmentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(post.request.body.holder).toEqual({
      dni: 20111222,
      firstName: 'Rosa',
      lastName: 'Gomez',
      email: 'rosa@mail.com',
    });
    post.flush({});
    flushAll(h.http, FORM_CATALOGS);
    expect(h.router.navigateByUrl).toHaveBeenCalled();
  });

  it('sends a back-dated enrolment date as ISO', () => {
    const fixture = setup('create');
    const g = groups(fixture);
    g.personal.patchValue({
      firstName: 'Ana',
      lastName: 'Gomez',
      dni: 40111299,
      birthDate: inDays(-10000),
    });
    g.classification.patchValue({ genderId: 2, relationshipId: 1 });
    g.billing.patchValue({ ...BILLING, enrolmentDate: new Date(2024, 1, 1) });
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    call(fixture, 'onSubmit');
    const post = h.http.match((r) => r.method === 'POST')[0];
    expect(post.request.body.enrolmentDate).toBe('2024-02-01');
    post.flush({});
    flushAll(h.http, FORM_CATALOGS);
  });

  it('does not submit without an enrolment date', () => {
    const fixture = setup('create');
    const g = groups(fixture);
    g.personal.patchValue({
      firstName: 'Ana',
      lastName: 'Gomez',
      dni: 40111299,
      birthDate: inDays(-10000),
    });
    g.classification.patchValue({ genderId: 2, relationshipId: 1 });
    g.billing.patchValue({ ...BILLING, enrolmentDate: null });
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'POST').length).toBe(0);
  });

  it('shows the backend error when create fails', () => {
    const fixture = setup('create');
    const g = groups(fixture);
    g.personal.patchValue({
      firstName: 'Ana',
      lastName: 'Gomez',
      dni: 40111299,
      birthDate: inDays(-10000),
    });
    g.classification.patchValue({ genderId: 2, relationshipId: 1 });
    g.billing.patchValue(BILLING);
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    call(fixture, 'onSubmit');
    h.http
      .match((r) => r.method === 'POST')[0]
      .flush({ detail: 'DNI duplicado' }, { status: 409, statusText: 'Conflict' });
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBe('DNI duplicado');
  });

  it('does not submit an invalid form', () => {
    const fixture = setup('create');
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'POST').length).toBe(0);
  });

  it('loads an affiliate in edit mode and updates it', () => {
    const fixture = setup('edit', { dni: '40111222' });
    const g = groups(fixture);
    expect(g.personal.getRawValue().lastName).toBe('Gomez');
    expect(g.billing.getRawValue().holderDni).toBe(20111222);
    expect(g.billing.getRawValue().healthTierCode).toBe('STANDARD');
    expect(g.billing.getRawValue().enrolmentDate).toEqual(new Date(2025, 2, 1));
    g.personal.patchValue({ firstName: 'Ana María' });
    g.personal.markAsDirty();
    settle(fixture);
    call(fixture, 'onSubmit');
    for (const req of h.http.match((r) => r.method === 'PUT')) {
      req.flush({ detail: 'error' }, { status: 500, statusText: 'Error' });
    }
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
  });

  it('reports a missing affiliate', () => {
    const fixture = setup('edit', { dni: '1' });
    expect(read(fixture, 'errorMessage')).toBe('No se encontró el afiliado solicitado.');
    call(fixture, 'onBack');
  });

  it('previews the fee for the birth date and tier', () => {
    const fixture = setup('create');
    const g = groups(fixture);
    g.personal.patchValue({ birthDate: new Date(1980, 0, 1) });
    g.billing.patchValue({ healthTierCode: 'STANDARD' });
    const quote = h.http.match((r) => r.url.includes('/membership/tariff/quote'));
    expect(quote.length).toBeGreaterThan(0);
    quote.at(-1)?.flush({
      insurable: false,
      monthlyFee: null,
      age: 90,
      ageBandLabel: null,
      healthTierCode: 'STANDARD',
      healthTierName: 'Estándar',
      waitingPeriodMonths: null,
      reason: 'ABOVE_MAX_ISSUE_AGE',
    });
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-testid="fee-preview"]')).toBeTruthy();
    expect(call(fixture, 'quoteReasonLabel', 'NO_AGE_BAND')).toContain('franja');
    expect(call(fixture, 'quoteReasonLabel', null)).toBe('No asegurable.');
  });

  it('clears the preview when the tier is removed', () => {
    const fixture = setup('create');
    const g = groups(fixture);
    g.personal.patchValue({ birthDate: new Date(1980, 0, 1) });
    g.billing.patchValue({ healthTierCode: 'STANDARD' });
    flushAll(h.http, FORM_CATALOGS);
    expect(read(fixture, 'quote')).not.toBeNull();
    g.billing.patchValue({ healthTierCode: '' });
    expect(read(fixture, 'quote')).toBeNull();
  });

  it('prefills a returning holder from the DNI lookup', () => {
    const fixture = setup('create');
    const g = groups(fixture);
    g.billing.patchValue({ holderDni: 20111222 });
    call(fixture, 'onHolderDniLookup');
    h.http
      .expectOne((r) => r.url.endsWith('/membership/holders/20111222'))
      .flush({
        holder: {
          id: 7,
          dni: 20111222,
          firstName: 'Rosa',
          lastName: 'Gomez',
          phone: null,
          email: null,
        },
        activeAffiliates: 2,
        monthlyTotal: 4000,
        affiliates: [],
      });
    settle(fixture);
    expect(g.billing.getRawValue().holderFirstName).toBe('Rosa');
    expect(read(fixture, 'holderLookup')).toEqual({
      kind: 'existing',
      activeAffiliates: 2,
      monthlyTotal: 4000,
    });
  });

  it('marks an unknown holder DNI as new and ignores other lookup errors', () => {
    const fixture = setup('create');
    const g = groups(fixture);
    g.billing.patchValue({ holderDni: 20111223 });
    call(fixture, 'onHolderDniLookup');
    h.http
      .expectOne((r) => r.url.endsWith('/membership/holders/20111223'))
      .flush({}, { status: 404, statusText: 'Not Found' });
    expect(read(fixture, 'holderLookup')).toEqual({ kind: 'new' });
    settle(fixture);

    call(fixture, 'onHolderDniLookup');
    h.http
      .expectOne((r) => r.url.endsWith('/membership/holders/20111223'))
      .flush({}, { status: 403, statusText: 'Forbidden' });
    expect(read(fixture, 'holderLookup')).toBeNull();

    g.billing.patchValue({ holderDni: 12 });
    call(fixture, 'onHolderDniLookup');
    expect(read(fixture, 'holderLookup')).toBeNull();
  });

  it('reports a tariff that fails to load', () => {
    h = configurePage({ data: { mode: 'create' } });
    const fixture = render(AffiliateFormPage);
    h.http
      .match((r) => r.url.endsWith('/membership/tariff'))
      .forEach((r) => r.flush({}, { status: 500, statusText: 'Error' }));
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBe('No se pudo cargar el tarifario.');
  });
});
