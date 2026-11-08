import type { FormGroup } from '@angular/forms';

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
import { CategoryFormPage } from './category-form.page';

describe('CategoryFormPage', () => {
  let h: PageHarness;

  function setup(mode: 'create' | 'edit', params: Record<string, string> = {}) {
    h = configurePage({ data: { mode }, params });
    const fixture = render(CategoryFormPage);
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    return fixture;
  }
  const form = (f: ReturnType<typeof setup>) => member<CategoryFormPage, FormGroup>(f, 'form');

  afterEach(() => h.http.verify());

  it('creates a category', () => {
    const fixture = setup('create');
    form(fixture).patchValue({ name: 'Urnas', description: 'Cinerarias' });
    call(fixture, 'onSubmit');
    h.http.match((r) => r.method === 'POST')[0].flush({ id: 9, name: 'Urnas', description: null });
    expect(h.navigate).toHaveBeenCalled();
  });

  it('does not submit an invalid form', () => {
    const fixture = setup('create');
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'POST').length).toBe(0);
  });

  it('loads and updates an existing category, surfacing errors', () => {
    const fixture = setup('edit', { id: '1' });
    expect(form(fixture).getRawValue().name).toBe('Cofres');
    form(fixture).patchValue({ name: 'Cofres 2' });
    form(fixture).markAsDirty();
    call(fixture, 'onSubmit');
    h.http
      .match((r) => r.method === 'PUT')[0]
      .flush({ detail: 'duplicada' }, { status: 409, statusText: 'Conflict' });
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBeTruthy();
  });

  it('reports a missing category', () => {
    expect(read(setup('edit', { id: '999' }), 'errorMessage')).toBe(
      'No se encontró la categoría solicitada.',
    );
  });
});
