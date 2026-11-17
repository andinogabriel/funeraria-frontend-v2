import type { ComponentFixture } from '@angular/core/testing';

import {
  call,
  configurePage,
  read,
  render,
  settle,
  stubDialog,
  textOf,
  type PageHarness,
} from '../../../../testing/page-harness';
import type { ActiveSession } from '../session.types';
import { ActiveSessionsPage } from './active-sessions.page';

const FIREFOX_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0 Mobile Safari/537.36';

function session(id: number, current: boolean, userAgent: string): ActiveSession {
  return {
    id,
    deviceType: 'BROWSER',
    userAgent,
    ipAddress: `10.0.0.${id}`,
    createdAt: '2026-11-17T12:00:00Z',
    lastSeenAt: '2026-11-17T13:00:00Z',
    current,
  };
}

const SESSIONS = [
  session(1, true, FIREFOX_WINDOWS),
  session(2, false, CHROME_ANDROID),
  session(3, false, FIREFOX_WINDOWS),
];

describe('ActiveSessionsPage', () => {
  let h: PageHarness;

  function setup(
    sessions: readonly ActiveSession[] = SESSIONS,
  ): ComponentFixture<ActiveSessionsPage> {
    h = configurePage();
    const fixture = render(ActiveSessionsPage);
    h.http.expectOne('/api/v1/users/me/sessions').flush(sessions);
    settle(fixture);
    return fixture;
  }

  afterEach(() => h.http.verify());

  it('lists every session with a readable device and marks this browser', () => {
    const fixture = setup();
    const text = textOf(fixture);

    expect(text).toContain('Firefox en Windows');
    expect(text).toContain('Chrome en Android');
    expect(text).toContain('Este navegador');
    expect(text).toContain('IP 10.0.0.2');
    expect(text).toContain('Cerrar las demás');
    // Only the other sessions can be closed from here.
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('li button').length).toBe(2);
  });

  it('offers no bulk action when only this browser is signed in', () => {
    const fixture = setup([session(1, true, FIREFOX_WINDOWS)]);
    expect(textOf(fixture)).not.toContain('Cerrar las demás');
  });

  it('shows the empty state when there is no session', () => {
    expect(textOf(setup([]))).toContain('No hay sesiones activas.');
  });

  it('closes another session after confirmation and drops it from the list', () => {
    const fixture = setup();
    stubDialog(true);
    const rows = read(fixture, 'rows') as readonly { session: ActiveSession }[];

    call(fixture, 'onClose', rows[1]);
    const req = h.http.expectOne('/api/v1/users/me/sessions/2');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    settle(fixture);

    expect((read(fixture, 'sessions') as readonly ActiveSession[]).map((s) => s.id)).toEqual([
      1, 3,
    ]);
    expect(read(fixture, 'closing')).toBeNull();
  });

  it('does nothing when the confirmation is dismissed', () => {
    const fixture = setup();
    stubDialog(undefined);
    const rows = read(fixture, 'rows') as readonly { session: ActiveSession }[];

    call(fixture, 'onClose', rows[1]);
    call(fixture, 'onCloseOthers');

    h.http.expectNone(() => true);
  });

  it('reloads the list when closing a session fails', () => {
    const fixture = setup();
    stubDialog(true);
    const rows = read(fixture, 'rows') as readonly { session: ActiveSession }[];

    call(fixture, 'onClose', rows[1]);
    h.http
      .expectOne('/api/v1/users/me/sessions/2')
      .flush(null, { status: 404, statusText: 'Not Found' });
    h.http.expectOne('/api/v1/users/me/sessions').flush([session(1, true, FIREFOX_WINDOWS)]);
    settle(fixture);

    expect((read(fixture, 'sessions') as readonly ActiveSession[]).length).toBe(1);
  });

  it('closes every other session and keeps only this browser', () => {
    const fixture = setup();
    stubDialog(true);

    call(fixture, 'onCloseOthers');
    const req = h.http.expectOne(
      (r) => r.method === 'DELETE' && r.url === '/api/v1/users/me/sessions',
    );
    req.flush({ closed: 2 });
    settle(fixture);

    expect((read(fixture, 'sessions') as readonly ActiveSession[]).map((s) => s.id)).toEqual([1]);
    expect(textOf(fixture)).not.toContain('Cerrar las demás');
  });

  it('reloads the list when closing the others fails', () => {
    const fixture = setup();
    stubDialog(true);

    call(fixture, 'onCloseOthers');
    h.http
      .expectOne((r) => r.method === 'DELETE')
      .flush(null, { status: 500, statusText: 'Server Error' });
    h.http.expectOne('/api/v1/users/me/sessions').flush(SESSIONS);
    settle(fixture);

    expect(read(fixture, 'closing')).toBeNull();
  });

  it('shows the error with a retry when the list cannot be loaded', () => {
    h = configurePage();
    const fixture = render(ActiveSessionsPage);
    h.http.expectOne('/api/v1/users/me/sessions').flush(null, { status: 0, statusText: '' });
    settle(fixture);

    expect(textOf(fixture)).toContain('No se pudo contactar al servidor.');
    call(fixture, 'load');
    h.http.expectOne('/api/v1/users/me/sessions').flush(SESSIONS);
    settle(fixture);
    expect(textOf(fixture)).toContain('Chrome en Android');
  });
});
