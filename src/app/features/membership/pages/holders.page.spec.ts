import type { FormControl } from '@angular/forms';

import {
  call,
  configurePage,
  member,
  read,
  render,
  settle,
  textOf,
  type PageHarness,
} from '../../../../testing/page-harness';
import type { MembershipHolderSummary } from '../billing.types';
import { HoldersPage, SEARCH_DEBOUNCE_MS } from './holders.page';

const ROSA: MembershipHolderSummary = {
  holder: { id: 7, dni: 20111222, firstName: 'Rosa', lastName: 'Gomez', phone: null, email: null },
  activeAffiliates: 2,
  monthlyTotal: 4000,
};

describe('HoldersPage', () => {
  let h: PageHarness;

  function setup() {
    h = configurePage({});
    const fixture = render(HoldersPage);
    settle(fixture);
    return fixture;
  }
  const search = (f: ReturnType<typeof setup>) =>
    member<HoldersPage, FormControl<string>>(f, 'search');

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    h.http.verify();
  });

  it('searches holders after the debounce and lists them with their monthly total', () => {
    const fixture = setup();
    search(fixture).setValue('  gomez ');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    const req = h.http.expectOne((r) => r.url.endsWith('/membership/holders'));
    expect(req.request.params.get('search')).toBe('gomez');
    req.flush([ROSA]);
    settle(fixture);

    expect(textOf(fixture)).toContain('Gomez, Rosa');
    expect(fixture.nativeElement.querySelectorAll('[data-testid="holder-result"]').length).toBe(1);
  });

  it('shows an empty state, clears on a blank search and reports failures', () => {
    const fixture = setup();
    search(fixture).setValue('zzz');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    h.http.expectOne((r) => r.url.endsWith('/membership/holders')).flush([]);
    settle(fixture);
    expect(textOf(fixture)).toContain('No hay titulares que coincidan.');

    search(fixture).setValue('');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    expect(read(fixture, 'results')).toBeNull();

    search(fixture).setValue('err');
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    h.http
      .expectOne((r) => r.url.endsWith('/membership/holders'))
      .flush({}, { status: 500, statusText: 'Error' });
    expect(read(fixture, 'searchError')).toBe('No se pudo buscar titulares.');
  });

  it('generates the dues of the selected month and shows the outcome', () => {
    const fixture = setup();
    member<HoldersPage, FormControl<string>>(fixture, 'period').setValue('2026-10');
    call(fixture, 'onGenerate');
    const req = h.http.expectOne((r) => r.url.endsWith('/membership/dues/generate'));
    expect(req.request.body).toEqual({ period: '2026-10' });
    req.flush({ period: '2026-10', created: 3, alreadyBilled: 1, repriced: 1, unbillable: 2 });
    settle(fixture);

    const result = fixture.nativeElement.querySelector('[data-testid="generation-result"]');
    expect(result.textContent).toContain('3 cuota(s) nueva(s)');
    expect(result.textContent).toContain('2 afiliado(s) sin titular');
  });

  it('reports a rejected generation and ignores an empty month', () => {
    const fixture = setup();
    call(fixture, 'onGenerate');
    h.http
      .expectOne((r) => r.url.endsWith('/membership/dues/generate'))
      .flush(
        { detail: 'No se pueden generar cuotas de un mes futuro.' },
        { status: 409, statusText: 'Conflict' },
      );
    expect(read(fixture, 'generationError')).toBe('No se pueden generar cuotas de un mes futuro.');

    member<HoldersPage, FormControl<string>>(fixture, 'period').setValue('');
    call(fixture, 'onGenerate');
    h.http.expectNone((r) => r.url.endsWith('/membership/dues/generate'));
  });
});
