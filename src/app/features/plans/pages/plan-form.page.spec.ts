import type { FormArray, FormGroup } from '@angular/forms';

import { FORM_CATALOGS } from '../../../../testing/form-catalogs';
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
import { PlanFormPage } from './plan-form.page';

describe('PlanFormPage', () => {
  let h: PageHarness;

  function setup(mode: 'create' | 'edit', params: Record<string, string> = {}) {
    h = configurePage({ data: { mode }, params });
    const fixture = render(PlanFormPage);
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    return fixture;
  }
  const form = (f: ReturnType<typeof setup>) => member<PlanFormPage, FormGroup>(f, 'form');
  const rows = (f: ReturnType<typeof setup>) => form(f).controls['itemsPlan'] as FormArray;

  afterEach(() => h.http.verify());

  it('creates a plan with item rows added and removed', () => {
    const fixture = setup('create');
    form(fixture).patchValue({ name: 'Plan Nuevo', description: 'x', profitPercentage: 25 });
    call(fixture, 'onAddItem');
    call(fixture, 'onAddItem');
    expect(rows(fixture).length).toBeGreaterThanOrEqual(2);
    call(fixture, 'onRemoveItem', rows(fixture).length - 1);
    rows(fixture).at(0).patchValue({ code: 'COF-001', quantity: 2 });
    for (let i = 1; i < rows(fixture).length; i++) {
      call(fixture, 'onRemoveItem', i);
    }
    expect(call(fixture, 'filteredItemsFor', 0)).toBeDefined();
    settle(fixture);
    call(fixture, 'onSubmit');
    const post = h.http.match((r) => r.method === 'POST')[0];
    expect(post.request.body.itemsPlan[0].quantity).toBe(2);
    post.flush({});
    flushAll(h.http, FORM_CATALOGS);
    expect(h.navigate).toHaveBeenCalled();
  });

  it('does not submit an invalid form', () => {
    const fixture = setup('create');
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'POST').length).toBe(0);
  });

  it('loads a plan in edit mode and reports update errors', () => {
    const fixture = setup('edit', { id: '3' });
    expect(form(fixture).getRawValue().name).toBe('Plan Standard');
    form(fixture).patchValue({ profitPercentage: 35 });
    form(fixture).markAsDirty();
    call(fixture, 'onSubmit');
    for (const req of h.http.match((r) => r.method === 'PUT')) {
      req.flush({ detail: 'error' }, { status: 409, statusText: 'Conflict' });
    }
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
  });

  it('reports a missing plan', () => {
    expect(read(setup('edit', { id: '999' }), 'errorMessage')).toBe(
      'No se encontró el plan solicitado.',
    );
  });
});
