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
import { BrandFormPage } from './brand-form.page';

describe('BrandFormPage', () => {
  let h: PageHarness;

  function setup(mode: 'create' | 'edit', params: Record<string, string> = {}) {
    h = configurePage({ data: { mode }, params });
    const fixture = render(BrandFormPage);
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    return fixture;
  }
  const form = (f: ReturnType<typeof setup>) => member<BrandFormPage, FormGroup>(f, 'form');

  afterEach(() => h.http.verify());

  it('creates a brand', () => {
    const fixture = setup('create');
    form(fixture).patchValue({ name: 'Nueva', webPage: 'https://nueva.com' });
    call(fixture, 'onSubmit');
    const post = h.http.match((r) => r.method === 'POST')[0];
    expect(post.request.body.name).toBe('Nueva');
    post.flush({ id: 9, name: 'Nueva', webPage: null });
    expect(h.navigate).toHaveBeenCalled();
  });

  it('does not submit an invalid form', () => {
    const fixture = setup('create');
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'POST').length).toBe(0);
  });

  it('loads and updates an existing brand, surfacing errors', () => {
    const fixture = setup('edit', { id: '1' });
    expect(form(fixture).getRawValue().name).toBe('Akme');
    form(fixture).patchValue({ name: 'Akme 2' });
    form(fixture).markAsDirty();
    call(fixture, 'onSubmit');
    h.http
      .match((r) => r.method === 'PUT')[0]
      .flush({ detail: 'duplicada' }, { status: 409, statusText: 'Conflict' });
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBeTruthy();
  });

  it('reports a missing brand', () => {
    expect(read(setup('edit', { id: '999' }), 'errorMessage')).toBe(
      'No se encontró la marca solicitada.',
    );
  });
});
