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

  it('filters the item picker by name after two characters and shows names for codes', () => {
    const fixture = setup('create');
    call(fixture, 'onAddItem');
    rows(fixture).at(0).patchValue({ code: 'c' });
    expect(call(fixture, 'filteredItemsFor', 0)).toEqual([]);
    rows(fixture).at(0).patchValue({ code: 'cofre' });
    expect((call(fixture, 'filteredItemsFor', 0) as { code: string }[]).map((i) => i.code)).toEqual(
      ['COF-001'],
    );
    expect(call(fixture, 'filteredItemsFor', 5)).toEqual([]);

    const display = member<PlanFormPage, (v: string | null) => string>(fixture, 'displayItemName');
    expect(display(null)).toBe('');
    expect(display('COF-001')).toBe('Cofre Standard');
    expect(display('typed text')).toBe('typed text');
  });

  it('rejects a typed item that is not in the catalog', () => {
    const fixture = setup('create');
    call(fixture, 'onAddItem');
    const code = (rows(fixture).at(0) as FormGroup).controls['code'];
    code.setValue('cir');
    expect(code.hasError('invalidItem')).toBe(true);
    code.setValue('COF-001');
    expect(code.valid).toBe(true);
  });

  it('skips the update of an untouched plan in edit mode', () => {
    const fixture = setup('edit', { id: '3' });
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'PUT').length).toBe(0);
    expect(h.navigate).toHaveBeenCalledWith(['/planes']);
  });

  it('updates a plan and goes back to the list', () => {
    const fixture = setup('edit', { id: '3' });
    form(fixture).patchValue({ description: '' });
    form(fixture).markAsDirty();
    call(fixture, 'onSubmit');
    const put = h.http.expectOne((r) => r.method === 'PUT');
    expect(put.request.body.description).toBeNull();
    put.flush({});
    flushAll(h.http, FORM_CATALOGS);
    expect(h.navigate).toHaveBeenCalledWith(['/planes']);
  });

  it('maps every server failure to a message', () => {
    const fixture = setup('create');
    expect(call(fixture, 'mapError', 0)).toContain('servidor');
    expect(call(fixture, 'mapError', 400)).toContain('Datos inválidos');
    expect(call(fixture, 'mapError', 400, 'Nombre vacío')).toBe('Nombre vacío');
    expect(call(fixture, 'mapError', 403)).toContain('permiso');
    expect(call(fixture, 'mapError', 409)).toContain('Ya existe');
    expect(call(fixture, 'mapError', 500)).toContain('inesperado');
  });

  it('reports a missing plan', () => {
    expect(read(setup('edit', { id: '999' }), 'errorMessage')).toBe(
      'No se encontró el plan solicitado.',
    );
  });
});
