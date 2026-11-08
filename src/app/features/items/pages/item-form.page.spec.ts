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
import { ItemFormPage } from './item-form.page';

describe('ItemFormPage', () => {
  let h: PageHarness;

  function setup(mode: 'create' | 'edit', params: Record<string, string> = {}) {
    h = configurePage({ data: { mode }, params });
    const fixture = render(ItemFormPage);
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
    return fixture;
  }
  const groups = (f: ReturnType<typeof setup>) => ({
    datos: member<ItemFormPage, FormGroup>(f, 'datos'),
    classification: member<ItemFormPage, FormGroup>(f, 'classification'),
  });

  function fill(fixture: ReturnType<typeof setup>) {
    const g = groups(fixture);
    g.datos.patchValue({ name: 'Urna', code: 'URN-1', price: 5000, description: 'Madera' });
    g.classification.patchValue({
      brandId: 1,
      categoryId: 1,
      itemLength: 30,
      itemHeight: 20,
      itemWidth: 20,
      lowStockThreshold: 3,
    });
    settle(fixture);
  }

  afterEach(() => h.http.verify());

  it('creates an item with brand, category and low-stock threshold', () => {
    const fixture = setup('create');
    fill(fixture);
    call(fixture, 'onSubmit');
    const post = h.http.match((r) => r.method === 'POST')[0];
    expect(post.request.body.lowStockThreshold).toBe(3);
    expect(post.request.body.brand.id).toBe(1);
    post.flush({});
    flushAll(h.http, FORM_CATALOGS);
    expect(h.router.navigateByUrl).toHaveBeenCalled();
  });

  it('shows the backend error when create fails', () => {
    const fixture = setup('create');
    fill(fixture);
    call(fixture, 'onSubmit');
    h.http
      .match((r) => r.method === 'POST')[0]
      .flush({ detail: 'Código duplicado' }, { status: 409, statusText: 'Conflict' });
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBeTruthy();
  });

  it('does not submit an invalid form', () => {
    const fixture = setup('create');
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'POST').length).toBe(0);
  });

  it('loads an item in edit mode and updates it', () => {
    const fixture = setup('edit', { code: 'COF-001' });
    const g = groups(fixture);
    expect(g.datos.getRawValue().name).toBe('Cofre Standard');
    g.datos.patchValue({ price: 160000 });
    g.datos.markAsDirty();
    settle(fixture);
    call(fixture, 'onSubmit');
    for (const req of h.http.match((r) => r.method === 'PUT')) {
      req.flush({ detail: 'error' }, { status: 500, statusText: 'Error' });
    }
    flushAll(h.http, FORM_CATALOGS);
    settle(fixture);
  });

  it('reports a missing item and goes back', () => {
    const fixture = setup('edit', { code: 'NOPE' });
    expect(read(fixture, 'errorMessage')).toBe('No se encontró el item solicitado.');
    call(fixture, 'onBack');
    expect(h.router.navigateByUrl).toHaveBeenCalled();
  });
});
