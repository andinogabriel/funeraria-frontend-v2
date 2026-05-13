import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { DEFAULT_PAGE_REQUEST } from '../../core/api/pagination.types';
import type { Page } from '../../core/api/pagination.types';
import { AuditService } from './audit.service';
import type { AuditEvent } from './audit.types';

describe('AuditService', () => {
  let service: AuditService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuditService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  function pageOf(events: readonly AuditEvent[]): Page<AuditEvent> {
    return {
      content: events,
      number: 0,
      size: 25,
      totalElements: events.length,
      totalPages: 1,
      first: true,
      last: true,
      numberOfElements: events.length,
      empty: events.length === 0,
    };
  }

  function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
    return {
      id: 1,
      occurredAt: '2026-05-13T15:00:00Z',
      actorEmail: 'admin@example.com',
      actorId: 1,
      action: 'USER_ROLE_GRANTED',
      targetType: 'USER',
      targetId: '2',
      traceId: null,
      correlationId: null,
      payload: '{"role":"ROLE_ADMIN"}',
      ...overrides,
    };
  }

  it('issues a GET to /api/v1/audit-events with page + size + filters', () => {
    service.search({ action: 'USER_ROLE_GRANTED' }, DEFAULT_PAGE_REQUEST).subscribe();

    const req = http.expectOne(
      (request) => request.url === '/api/v1/audit-events' && request.method === 'GET',
    );
    expect(req.request.params.get('page')).toBe('0');
    expect(req.request.params.get('size')).toBe('25');
    expect(req.request.params.get('action')).toBe('USER_ROLE_GRANTED');
    expect(req.request.params.has('actorEmail')).toBe(false);
    req.flush(pageOf([event()]));
  });

  it('updates the page + loading signals on success and clears the error', () => {
    service.search().subscribe();
    expect(service.loading()).toBe(true);
    expect(service.page()).toBeNull();

    const req = http.expectOne('/api/v1/audit-events?page=0&size=25');
    const payload = pageOf([event(), event({ id: 2 })]);
    req.flush(payload);

    expect(service.loading()).toBe(false);
    expect(service.page()).toEqual(payload);
    expect(service.error()).toBeNull();
    expect(service.empty()).toBe(false);
  });

  it('reports a friendly error when the server returns 403', () => {
    service.search().subscribe({ error: () => undefined });

    const req = http.expectOne((r) => r.url === '/api/v1/audit-events');
    req.flush(
      { code: 'error.forbidden', title: 'Forbidden', status: 403, instance: '/' },
      { status: 403, statusText: 'Forbidden' },
    );

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No tenés permiso para ver el registro de auditoría.');
  });

  it('reports a network error when status is 0', () => {
    service.search().subscribe({ error: () => undefined });
    const req = http.expectOne((r) => r.url === '/api/v1/audit-events');
    req.error(new ProgressEvent('error'), { status: 0, statusText: '' });

    expect(service.error()).toBe('No se pudo contactar al servidor.');
  });

  it('reset() clears every signal back to its initial state', () => {
    service.search().subscribe();
    http.expectOne((r) => r.url === '/api/v1/audit-events').flush(pageOf([event()]));
    expect(service.page()).not.toBeNull();

    service.reset();
    expect(service.page()).toBeNull();
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
  });
});
