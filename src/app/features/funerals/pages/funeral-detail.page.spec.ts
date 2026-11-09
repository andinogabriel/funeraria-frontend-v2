import { funeral } from '../../../../testing/fixtures';
import {
  call,
  configurePage,
  flushAll,
  read,
  render,
  settle,
  stubDialog,
  textOf,
  type PageHarness,
} from '../../../../testing/page-harness';
import { FuneralDetailPage } from './funeral-detail.page';

describe('FuneralDetailPage', () => {
  let h: PageHarness;
  const fixtures = [[/\/funerals$/, [funeral()]]] as const;

  function setup(id = '5') {
    h = configurePage({ params: { id } });
    const fixture = render(FuneralDetailPage);
    flushAll(h.http, fixtures);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('loads the service and renders the deceased and plan', () => {
    const fixture = setup();
    expect(textOf(fixture)).toContain('Perez');
    expect(textOf(fixture)).toContain('Plan Standard');
  });

  it('shows the coverage recorded when the service was registered', () => {
    h = configurePage({ params: { id: '5' } });
    const fixture = render(FuneralDetailPage);
    const base = funeral();
    const covered = {
      ...base,
      deceased: {
        ...base.deceased,
        coverageEligible: false,
        coverageReasons: ['ACCOUNT_IN_ARREARS'],
      },
    };
    flushAll(h.http, [[/\/funerals$/, [covered]]]);
    settle(fixture);
    expect(textOf(fixture)).toContain('No cubierto por la membresía');
    expect(textOf(fixture)).toContain('cuotas en mora');
  });

  it('shows no coverage verdict for a deceased that was not an affiliate', () => {
    const fixture = setup();
    expect(textOf(fixture)).not.toContain('cubierto por la membresía');
  });

  function setupWith(record: ReturnType<typeof funeral>, id = '5') {
    h = configurePage({ params: { id } });
    const fixture = render(FuneralDetailPage);
    flushAll(h.http, [[/\/funerals$/, [record]]]);
    settle(fixture);
    return fixture;
  }

  it('formats the full place of death and dashes for a missing tax or register date', () => {
    const base = funeral();
    const fixture = setupWith({
      ...base,
      tax: null as never,
      registerDate: null as never,
      deceased: {
        ...base.deceased,
        placeOfDeath: {
          streetName: 'Calle 7',
          blockStreet: 1234,
          apartment: 'B',
          flat: '2',
          city: { id: 10, name: 'La Plata' },
        } as never,
      },
    });
    expect(read(fixture, 'placeOfDeathLabel')).toBe('Calle 7 1234, Dpto B, Piso 2 — La Plata');
    expect(read(fixture, 'taxLabel')).toBe('—');
    expect(read(fixture, 'registerDateLabel')).toBe('—');
  });

  it('shows a street-only place of death without the city', () => {
    const base = funeral();
    const fixture = setupWith({
      ...base,
      deceased: { ...base.deceased, placeOfDeath: { streetName: 'Calle 7' } as never },
    });
    expect(read(fixture, 'placeOfDeathLabel')).toBe('Calle 7');
  });

  it('treats a non-numeric id as not found and ignores every action', () => {
    const fixture = setupWith(funeral(), 'abc');
    expect(read(fixture, 'funeral')).toBeNull();
    expect(read(fixture, 'title')).toBe('Servicio funerario');
    expect(read(fixture, 'totalLabel')).toBe('—');
    expect(read(fixture, 'funeralDateLabel')).toBe('—');
    expect(read(fixture, 'birthDateLabel')).toBe('—');
    expect(read(fixture, 'deathDateLabel')).toBe('—');
    expect(read(fixture, 'taxLabel')).toBe('—');
    expect(read(fixture, 'placeOfDeathLabel')).toBeNull();
    const dialog = stubDialog(true);
    call(fixture, 'onEdit');
    call(fixture, 'onDownloadPdf');
    call(fixture, 'onDelete');
    expect(h.navigate).not.toHaveBeenCalled();
    expect(dialog.open).not.toHaveBeenCalled();
  });

  it('keeps the service when the deletion is cancelled', () => {
    const fixture = setup();
    stubDialog(false);
    call(fixture, 'onDelete');
    h.http.expectNone((r) => r.method === 'DELETE');
  });

  it('ignores a second PDF click while the first download is in flight', () => {
    const fixture = setup();
    call(fixture, 'onDownloadPdf');
    call(fixture, 'onDownloadPdf');
    const requests = h.http.match((r) => r.url.includes('/pdf'));
    expect(requests.length).toBe(1);
    requests.forEach((r) => r.flush(new Blob(), { status: 500, statusText: 'Error' }));
  });

  it('shows the not-found state for an unknown id', () => {
    const fixture = setup('999');
    expect(read(fixture, 'funeral')).toBeNull();
  });

  it('navigates back and to edit', () => {
    const fixture = setup();
    call(fixture, 'onBack');
    call(fixture, 'onEdit');
    expect(h.router.navigateByUrl).toHaveBeenCalled();
    expect(h.navigate).toHaveBeenCalled();
  });

  it('downloads the PDF as a blob', () => {
    const fixture = setup();
    const createUrl = vi.fn(() => 'blob:x');
    const revokeUrl = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revokeUrl });
    call(fixture, 'onDownloadPdf');
    h.http
      .match((r) => r.url.includes('/pdf'))
      .forEach((r) => r.flush(new Blob(['%PDF'], { type: 'application/pdf' })));
    expect(createUrl).toHaveBeenCalled();
  });

  it('reports a failed PDF download', () => {
    const fixture = setup();
    call(fixture, 'onDownloadPdf');
    h.http
      .match((r) => r.url.includes('/pdf'))
      .forEach((r) => r.flush(new Blob(), { status: 500, statusText: 'Error' }));
    settle(fixture);
  });

  it('deletes after confirmation and goes back; restores on failure', () => {
    const fixture = setup();
    stubDialog(true);
    call(fixture, 'onDelete');
    h.http.match((r) => r.method === 'DELETE').forEach((r) => r.flush(null));
    expect(h.router.navigateByUrl).toHaveBeenCalled();

    call(fixture, 'onDelete');
    h.http
      .match((r) => r.method === 'DELETE')
      .forEach((r) => r.flush({ detail: 'x' }, { status: 409, statusText: 'Conflict' }));
    flushAll(h.http, fixtures);
  });
});
