import { TestBed } from '@angular/core/testing';

import type { DataTablePreferences } from './data-table.types';
import { TablePreferencesService } from './table-preferences.service';

describe('TablePreferencesService', () => {
  let service: TablePreferencesService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(TablePreferencesService);
    window.localStorage.clear();
  });

  it('returns null when nothing was persisted yet', () => {
    expect(service.load('any.key')).toBeNull();
  });

  it('round-trips a valid payload', () => {
    const payload: DataTablePreferences = {
      version: 1,
      visibleColumns: ['dni', 'lastName'],
      sort: { active: 'lastName', direction: 'asc' },
      pageSize: 25,
    };

    service.save('table.test', payload);

    expect(service.load('table.test')).toEqual(payload);
  });

  it('rejects payloads from a different schema version and returns null instead', () => {
    window.localStorage.setItem(
      'fnr.table.legacy',
      JSON.stringify({ version: 0, visibleColumns: ['x'], pageSize: 10 }),
    );

    expect(service.load('legacy')).toBeNull();
  });

  it('rejects unreadable JSON without throwing', () => {
    window.localStorage.setItem('fnr.table.broken', 'not-json');

    expect(service.load('broken')).toBeNull();
  });

  it('drops non-string entries from visibleColumns when restoring', () => {
    window.localStorage.setItem(
      'fnr.table.mixed',
      JSON.stringify({
        version: 1,
        visibleColumns: ['dni', 42, null, 'lastName'],
        sort: null,
        pageSize: 10,
      }),
    );

    expect(service.load('mixed')).toEqual({
      version: 1,
      visibleColumns: ['dni', 'lastName'],
      sort: null,
      pageSize: 10,
    });
  });

  it('clears the persisted entry on demand', () => {
    service.save('table.test', {
      version: 1,
      visibleColumns: ['dni'],
      sort: null,
      pageSize: 10,
    });

    service.clear('table.test');

    expect(service.load('table.test')).toBeNull();
  });
});
