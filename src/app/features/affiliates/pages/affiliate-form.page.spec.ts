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
  });

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
    settle(fixture);
    call(fixture, 'onSubmit');
    const post = h.http.match((r) => r.method === 'POST')[0];
    expect(post.request.body.dni).toBe(40111299);
    post.flush({});
    flushAll(h.http, FORM_CATALOGS);
    expect(h.router.navigateByUrl).toHaveBeenCalled();
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
    settle(fixture);
    call(fixture, 'onSubmit');
    h.http
      .match((r) => r.method === 'POST')[0]
      .flush({ detail: 'DNI duplicado' }, { status: 409, statusText: 'Conflict' });
    settle(fixture);
    expect(read(fixture, 'errorMessage')).toBeTruthy();
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
});
