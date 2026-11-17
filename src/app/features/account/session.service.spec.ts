import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { SessionService, sessionErrorMessage } from './session.service';
import type { ActiveSession } from './session.types';

function session(id: number, current: boolean): ActiveSession {
  return {
    id,
    deviceType: 'BROWSER',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/140.0',
    ipAddress: '10.0.0.1',
    createdAt: '2026-11-17T12:00:00Z',
    lastSeenAt: '2026-11-17T13:00:00Z',
    current,
  };
}

describe('SessionService', () => {
  let service: SessionService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(SessionService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the sessions with the current one first, keeping the backend order otherwise', () => {
    let result: readonly ActiveSession[] = [];
    service.list().subscribe((sessions) => (result = sessions));

    http
      .expectOne('/api/v1/users/me/sessions')
      .flush([session(2, false), session(1, true), session(3, false)]);

    expect(result.map((s) => s.id)).toEqual([1, 2, 3]);
  });

  it('closes one session with DELETE on its id', () => {
    let done = false;
    service.close(7).subscribe(() => (done = true));

    const req = http.expectOne('/api/v1/users/me/sessions/7');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
    expect(done).toBe(true);
  });

  it('closes the others and emits how many were closed', () => {
    let closed = -1;
    service.closeOthers().subscribe((count) => (closed = count));

    const req = http.expectOne('/api/v1/users/me/sessions');
    expect(req.request.method).toBe('DELETE');
    req.flush({ closed: 3 });
    expect(closed).toBe(3);
  });
});

describe('sessionErrorMessage', () => {
  it('explains a network failure', () => {
    expect(sessionErrorMessage({ status: 0 })).toBe('No se pudo contactar al servidor.');
  });

  it('explains a session that no longer exists', () => {
    expect(sessionErrorMessage({ status: 404 })).toBe('La sesión ya no existe.');
  });

  it('uses the backend detail, or a generic message', () => {
    expect(sessionErrorMessage({ status: 409, error: { detail: 'Usá Cerrar sesión.' } })).toBe(
      'Usá Cerrar sesión.',
    );
    expect(sessionErrorMessage({ status: 500 })).toBe('No se pudieron consultar las sesiones.');
  });
});
