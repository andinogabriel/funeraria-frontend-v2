import type { Type } from '@angular/core';
import type { FormGroup } from '@angular/forms';

import { FORM_CATALOGS } from '../../testing/form-catalogs';
import {
  call,
  configurePage,
  flushAll,
  member,
  read,
  render,
  settle,
  type PageHarness,
} from '../../testing/page-harness';
import { BrandFormPage } from './brands/pages/brand-form.page';
import { CategoryFormPage } from './categories/pages/category-form.page';

/** Branches the brand and category forms share: pristine edit, update, optional field, errors. */
const cases: readonly {
  name: string;
  page: Type<unknown>;
  listRoute: string;
  optional: string;
  duplicate: string;
}[] = [
  {
    name: 'BrandFormPage',
    page: BrandFormPage,
    listRoute: '/marcas',
    optional: 'webPage',
    duplicate: 'marca',
  },
  {
    name: 'CategoryFormPage',
    page: CategoryFormPage,
    listRoute: '/categorias',
    optional: 'description',
    duplicate: 'categoría',
  },
];

for (const c of cases) {
  describe(c.name, () => {
    let h: PageHarness;

    function setup(mode: 'create' | 'edit', params: Record<string, string> = {}) {
      h = configurePage({ data: { mode }, params });
      const fixture = render(c.page);
      flushAll(h.http, FORM_CATALOGS);
      settle(fixture);
      return fixture;
    }
    const form = (f: ReturnType<typeof setup>) => member<unknown, FormGroup>(f, 'form');

    afterEach(() => h.http.verify());

    it('goes back without a PUT when nothing changed', () => {
      const fixture = setup('edit', { id: '1' });
      call(fixture, 'onSubmit');
      expect(h.http.match((r) => r.method === 'PUT').length).toBe(0);
      expect(h.navigate).toHaveBeenCalledWith([c.listRoute]);
    });

    it('updates the record and sends a blank optional field as null', () => {
      const fixture = setup('edit', { id: '1' });
      form(fixture).patchValue({ [c.optional]: '   ' });
      form(fixture).markAsDirty();
      call(fixture, 'onSubmit');
      const put = h.http.expectOne((r) => r.method === 'PUT');
      expect(put.request.body[c.optional]).toBeNull();
      put.flush({ id: 1, name: 'x' });
      expect(h.navigate).toHaveBeenCalledWith([c.listRoute]);
    });

    it('treats a non-numeric id as a new record', () => {
      const fixture = setup('edit', { id: 'abc' });
      expect(form(fixture).getRawValue().name).toBe('');
    });

    it('maps every server failure to a message', () => {
      const fixture = setup('create');
      expect(call(fixture, 'mapError', 0)).toContain('servidor');
      expect(call(fixture, 'mapError', 400)).toContain('Datos inválidos');
      expect(call(fixture, 'mapError', 400, 'Nombre vacío')).toBe('Nombre vacío');
      expect(call(fixture, 'mapError', 403)).toContain('permiso');
      expect(call(fixture, 'mapError', 409)).toContain(c.duplicate);
      expect(call(fixture, 'mapError', 500)).toContain('inesperado');
      expect(call(fixture, 'mapError', 500, 'Caído')).toBe('Caído');
      expect(read(fixture, 'errorMessage')).toBeNull();
    });
  });
}
