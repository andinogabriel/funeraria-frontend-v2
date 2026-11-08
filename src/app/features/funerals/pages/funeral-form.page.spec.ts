import type { FormGroup } from '@angular/forms';

import { affiliate, funeral, item, plan } from '../../../../testing/fixtures';
import {
  call,
  configurePage,
  flushAll,
  member,
  read,
  render,
  settle,
  textOf,
  type Fixture,
  type PageHarness,
} from '../../../../testing/page-harness';
import { FuneralFormPage } from './funeral-form.page';

/** Funeral dates must not be in the past ([min]=today in the template). */
const inDays = (days: number) => new Date(Date.now() + days * 86_400_000);

const named = (id: number, name: string) => ({ id, name });

const catalogs: Fixture[] = [
  [/\/genders/, [named(1, 'Masculino')]],
  [/\/relationships/, [named(1, 'Padre')]],
  [/death-?causes/i, [named(1, 'Natural')]],
  [/receipt-?types/i, [named(1, 'Factura A')]],
  [/\/provinces/, [named(1, 'Buenos Aires')]],
  [/\/cities/, [named(10, 'La Plata')]],
  [/\/plans/, [plan()]],
  [/\/items/, [item()]],
  [/\/affiliates/, [affiliate({ dni: 30111222 })]],
  [/\/funerals/, [funeral()]],
  [/\/users/, [{ id: 4, email: 'deudo@x.com', firstName: 'Deudo', lastName: 'Uno' }]],
];

describe('FuneralFormPage', () => {
  let h: PageHarness;

  function setup(mode: 'create' | 'edit', params: Record<string, string> = {}) {
    h = configurePage({ data: { mode }, params });
    const fixture = render(FuneralFormPage);
    flushAll(h.http, catalogs);
    settle(fixture);
    return fixture;
  }

  const groups = (fixture: ReturnType<typeof setup>) => ({
    servicio: member<FuneralFormPage, FormGroup>(fixture, 'servicio'),
    fallecido: member<FuneralFormPage, FormGroup>(fixture, 'fallecido'),
    place: member<FuneralFormPage, FormGroup>(fixture, 'placeOfDeath'),
    plan: member<FuneralFormPage, FormGroup>(fixture, 'planSelection'),
  });

  function fillValid(fixture: ReturnType<typeof setup>) {
    const g = groups(fixture);
    g.servicio.patchValue({
      funeralDate: inDays(3),
      funeralTime: '10:30',
      receiptTypeId: 1,
      receiptNumber: 'F-9',
      receiptSeries: '1',
      tax: 21,
    });
    g.fallecido.patchValue({
      firstName: 'Juan',
      lastName: 'Perez',
      dni: 30111222,
      birthDate: new Date(1950, 0, 1),
      deathDate: inDays(-1),
      genderId: 1,
      deceasedRelationshipId: 1,
      deathCauseId: 1,
      deceasedUserId: 4,
    });
    g.plan.patchValue({ planId: 3 });
    settle(fixture);
  }

  afterEach(() => h.http.verify());

  it('loads every catalog in create mode', () => {
    const fixture = setup('create');
    expect(read(fixture, 'mode')).toBe('create');
    expect(textOf(fixture).length).toBeGreaterThan(0);
  });

  it('creates a service with plan items and a place of death', () => {
    const fixture = setup('create');
    fillValid(fixture);
    const g = groups(fixture);
    g.place.patchValue({ include: true, provinceId: 1 });
    settle(fixture);
    flushAll(h.http, catalogs);
    g.place.patchValue({
      cityId: 10,
      streetName: 'Calle 7',
      blockStreet: 100,
      apartment: 'A',
      flat: '2',
    });
    settle(fixture);

    call(fixture, 'onSubmit');
    const post = h.http.match((r) => r.method === 'POST')[0];
    expect(post.request.body.plan.itemsPlan.length).toBe(1);
    expect(post.request.body.deceased.placeOfDeath.city.id).toBe(10);
    expect(post.request.body.funeralDate).toContain('10:30');
    post.flush(funeral());
    flushAll(h.http, catalogs);
    expect(h.router.navigateByUrl).toHaveBeenCalled();
  });

  it('prefills the deceased from the selected affiliate', () => {
    const fixture = setup('create');
    const g = groups(fixture);
    g.fallecido.patchValue({ isAffiliated: true });
    settle(fixture);
    g.fallecido.patchValue({ affiliateDni: 30111222 });
    settle(fixture);
    expect(g.fallecido.getRawValue().firstName).toBe('Ana');
    g.fallecido.patchValue({ isAffiliated: false });
    settle(fixture);
    expect(g.fallecido.getRawValue().affiliateDni).toBeNull();
  });

  it('shows the backend error when create fails', () => {
    const fixture = setup('create');
    fillValid(fixture);
    call(fixture, 'onSubmit');
    h.http
      .match((r) => r.method === 'POST')[0]
      .flush({ detail: 'Recibo duplicado' }, { status: 409, statusText: 'Conflict' });
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBeTruthy();
  });

  it('does not submit an invalid form', () => {
    const fixture = setup('create');
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'POST').length).toBe(0);
  });

  it('loads the record in edit mode and updates it optimistically', () => {
    const fixture = setup('edit', { id: '5' });
    const g = groups(fixture);
    expect(g.fallecido.getRawValue().lastName).toBe('Perez');
    g.servicio.patchValue({ funeralDate: inDays(2) });
    g.servicio.markAsDirty();
    settle(fixture);
    call(fixture, 'onSubmit');
    const put = h.http.match((r) => r.method === 'PUT')[0];
    expect(put).toBeDefined();
    expect(h.router.navigateByUrl).toHaveBeenCalled();
    put.flush({ detail: 'no' }, { status: 500, statusText: 'Error' });
    flushAll(h.http, catalogs);
  });

  it('keeps the place-of-death city when loading a record (regression)', () => {
    const fixture = setup('edit', { id: '5' });
    const place = groups(fixture).place.getRawValue();
    expect(place.provinceId).toBe(1);
    expect(place.cityId).toBe(10);
    expect(groups(fixture).place.controls['cityId'].enabled).toBe(true);
  });

  it('leaves an unchanged record without calling the backend', () => {
    const fixture = setup('edit', { id: '5' });
    groups(fixture).servicio.patchValue({ funeralDate: inDays(2) });
    settle(fixture);
    call(fixture, 'onSubmit');
    expect(h.http.match((r) => r.method === 'PUT').length).toBe(0);
    expect(h.router.navigateByUrl).toHaveBeenCalled();
  });

  it('reports a missing record in edit mode', () => {
    const fixture = setup('edit', { id: '999' });
    expect(read(fixture, 'errorMessage')).toBe('No se encontró el servicio solicitado.');
  });

  it('goes back to the list', () => {
    const fixture = setup('create');
    call(fixture, 'onBack');
    expect(h.router.navigateByUrl).toHaveBeenCalled();
  });
});
