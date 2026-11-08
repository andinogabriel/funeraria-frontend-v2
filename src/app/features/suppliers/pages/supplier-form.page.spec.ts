import type { FormArray, FormGroup } from '@angular/forms';

import { FORM_CATALOGS } from '../../../../testing/form-catalogs';
import { supplier } from '../../../../testing/fixtures';
import {
  call,
  configurePage,
  flushAll,
  member,
  read,
  render,
  settle,
  type Fixture,
  type PageHarness,
} from '../../../../testing/page-harness';
import { SupplierFormPage } from './supplier-form.page';

const withAddress = supplier({
  addresses: [
    {
      id: 1,
      streetName: 'Calle 7',
      blockStreet: 100,
      apartment: 'A',
      flat: '2',
      city: { id: 10, name: 'La Plata', province: { id: 1, name: 'Buenos Aires' } },
    },
  ],
});
const catalogs: Fixture[] = [[/\/suppliers/, [withAddress]], ...FORM_CATALOGS];

describe('SupplierFormPage', () => {
  let h: PageHarness;

  function setup(mode: 'create' | 'edit', params: Record<string, string> = {}) {
    h = configurePage({ data: { mode }, params });
    const fixture = render(SupplierFormPage);
    flushAll(h.http, catalogs);
    settle(fixture);
    return fixture;
  }
  const form = (f: ReturnType<typeof setup>) => member<SupplierFormPage, FormGroup>(f, 'form');
  const arr = (f: ReturnType<typeof setup>, name: string) => form(f).controls[name] as FormArray;

  afterEach(() => h.http.verify());

  it('creates a supplier with phones and an address (city cascade)', () => {
    const fixture = setup('create');
    form(fixture).patchValue({
      name: 'Nueva SA',
      nif: '30-99999999-9',
      webPage: 'https://nueva.com',
      email: 'ventas@nueva.com',
    });
    call(fixture, 'onAddMobile');
    call(fixture, 'onAddMobile');
    call(fixture, 'onRemoveMobile', arr(fixture, 'mobileNumbers').length - 1);
    arr(fixture, 'mobileNumbers').at(0).patchValue({ mobileNumber: '1155554444' });
    call(fixture, 'onAddAddress');
    const address = arr(fixture, 'addresses').at(0);
    address.patchValue({ provinceId: 1 });
    settle(fixture);
    flushAll(h.http, catalogs);
    expect(call(fixture, 'citiesForRow', 0)).toEqual([{ id: 10, name: 'La Plata' }]);
    address.patchValue({ cityId: 10, streetName: 'Calle 1' });
    call(fixture, 'onAddAddress');
    call(fixture, 'onRemoveAddress', 1);
    settle(fixture);

    call(fixture, 'onSubmit');
    const post = h.http.match((r) => r.method === 'POST')[0];
    expect(post.request.body.addresses[0].city.id).toBe(10);
    post.flush({});
    flushAll(h.http, catalogs);
    expect(h.navigate).toHaveBeenCalled();
  });

  it('does not submit an invalid form', () => {
    const fixture = setup('create');
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'POST').length).toBe(0);
  });

  it('loads a supplier in edit mode keeping the address city, and reports update errors', () => {
    const fixture = setup('edit', { nif: '30-11111111-1' });
    expect(form(fixture).getRawValue().name).toBe('Proveedora Norte');
    expect(arr(fixture, 'addresses').at(0).getRawValue().cityId).toBe(10);
    form(fixture).patchValue({ email: 'otro@norte.com' });
    form(fixture).markAsDirty();
    call(fixture, 'onSubmit');
    for (const req of h.http.match((r) => r.method === 'PUT')) {
      req.flush({ detail: 'error' }, { status: 409, statusText: 'Conflict' });
    }
    flushAll(h.http, catalogs);
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBeTruthy();
  });

  it('reports a missing supplier', () => {
    expect(read(setup('edit', { nif: 'nope' }), 'errorMessage')).toBe(
      'No se encontró el proveedor solicitado.',
    );
  });
});
