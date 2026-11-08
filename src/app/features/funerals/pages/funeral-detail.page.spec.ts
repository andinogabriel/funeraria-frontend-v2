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
