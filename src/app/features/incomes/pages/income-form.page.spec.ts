import type { FormArray, FormGroup } from '@angular/forms';

import { FORM_CATALOGS } from '../../../../testing/form-catalogs';
import { income } from '../../../../testing/fixtures';
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
import { IncomeFormPage } from './income-form.page';

describe('IncomeFormPage', () => {
  let h: PageHarness;

  function setup(mode: 'create' | 'edit', params: Record<string, string> = {}) {
    h = configurePage({ data: { mode }, params });
    const fixture = render(IncomeFormPage);
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    return fixture;
  }
  const form = (f: ReturnType<typeof setup>) => member<IncomeFormPage, FormGroup>(f, 'form');
  const details = (f: ReturnType<typeof setup>) => form(f).controls['details'] as FormArray;

  function fillHeader(fixture: ReturnType<typeof setup>) {
    form(fixture).patchValue({
      receiptNumber: '9100',
      receiptSeries: '1',
      receiptTypeId: 1,
      supplierNif: '30-11111111-1',
      tax: 21,
    });
  }

  afterEach(() => h.http.verify());

  it('creates an income with detail rows', () => {
    const fixture = setup('create');
    fillHeader(fixture);
    call(fixture, 'onAddDetail');
    call(fixture, 'onAddDetail');
    call(fixture, 'onRemoveDetail', details(fixture).length - 1);
    details(fixture)
      .at(0)
      .patchValue({ itemCode: 'COF-001', quantity: 2, purchasePrice: 1000, salePrice: 1500 });
    for (let i = 1; i < details(fixture).length; i++) {
      call(fixture, 'onRemoveDetail', i);
    }
    settle(fixture);
    call(fixture, 'onSubmit');
    const post = h.http.match((r) => r.method === 'POST')[0];
    expect(post.request.body.incomeDetails[0].quantity).toBe(2);
    post.flush(income({ receiptNumber: '9100' }));
    flushAll(h.http, FORM_CATALOGS);
    expect(h.router.navigateByUrl).toHaveBeenCalled();
  });

  it('asks for at least one item', () => {
    const fixture = setup('create');
    fillHeader(fixture);
    while (details(fixture).length > 0) {
      call(fixture, 'onRemoveDetail', 0);
    }
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'POST').length).toBe(0);
    expect(read(fixture, 'errorMessage')).toBeTruthy();
  });

  it('does not submit an invalid form', () => {
    const fixture = setup('create');
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'POST').length).toBe(0);
  });

  it('loads an income in edit mode and reports update errors', () => {
    const fixture = setup('edit', { receiptNumber: '9001' });
    expect(String(form(fixture).getRawValue().receiptNumber)).toBe('9001');
    form(fixture).patchValue({ tax: 10.5 });
    form(fixture).markAsDirty();
    call(fixture, 'onSubmit');
    for (const req of h.http.match((r) => r.method === 'PUT')) {
      req.flush({ detail: 'error' }, { status: 409, statusText: 'Conflict' });
    }
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    call(fixture, 'onBack');
  });

  it('reports a missing income', () => {
    h = configurePage({ data: { mode: 'edit' }, params: { receiptNumber: '1' } });
    const fixture = render(IncomeFormPage);
    // Catalogs first; the record GET is only issued once they resolve.
    for (const req of h.http.match(() => true)) {
      const hit = FORM_CATALOGS.find(([m]) => (m as RegExp).test(req.request.url));
      req.flush((hit ? hit[1] : []) as object);
    }
    settle(fixture);
    for (const req of h.http.match((r) => r.url.includes('/incomes/1'))) {
      req.flush(null, { status: 404, statusText: 'Not Found' });
    }
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBeTruthy();
  });
});
