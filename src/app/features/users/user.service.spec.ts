import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { UserService } from './user.service';

describe('UserService', () => {
  let service: UserService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UserService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('GETs /api/v1/users on loadAll and exposes a narrowed summary in the list signal', () => {
    service.loadAll().subscribe();
    expect(service.loading()).toBe(true);

    http.expectOne('/api/v1/users').flush([
      {
        id: 1,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        enabled: true,
        // Fields the service should ignore — making sure the wire-to-summary
        // mapping drops them so consumers never see the full UserResponseDto.
        roles: [{ id: 1, name: 'ROLE_USER' }],
        mobileNumbers: [],
        addresses: [],
      },
    ]);

    expect(service.loading()).toBe(false);
    expect(service.list()).toEqual([
      { id: 1, firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com', enabled: true },
    ]);
  });

  it('reports a Spanish error message and clears loading on 403', () => {
    service.loadAll().subscribe({ error: () => undefined });
    http.expectOne('/api/v1/users').flush(null, { status: 403, statusText: 'Forbidden' });

    expect(service.loading()).toBe(false);
    expect(service.error()).toBe('No tenés permiso para listar usuarios.');
  });

  it('findById returns the cached user or undefined', () => {
    service.loadAll().subscribe();
    http.expectOne('/api/v1/users').flush([
      { id: 1, firstName: 'A', lastName: 'A', email: 'a@x', enabled: true },
      { id: 2, firstName: 'B', lastName: 'B', email: 'b@x', enabled: false },
    ]);

    expect(service.findById(2)?.email).toBe('b@x');
    expect(service.findById(99)).toBeUndefined();
  });
});
