import { DOCUMENT } from '@angular/common';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { useVisibilityRefresh } from './use-visibility-refresh';

const lastFetchedAt = signal<Date | null>(null);
const refresh = vi.fn();

@Component({ selector: 'app-visibility-host', template: '' })
class HostComponent {
  constructor() {
    useVisibilityRefresh(lastFetchedAt, refresh, { staleAfterMs: 1_000 });
  }
}

describe('useVisibilityRefresh', () => {
  let visibility: DocumentVisibilityState;

  beforeEach(() => {
    refresh.mockClear();
    visibility = 'visible';
    const document = TestBed.inject(DOCUMENT);
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
  });

  afterEach(() => vi.restoreAllMocks());

  const fire = () => TestBed.inject(DOCUMENT).dispatchEvent(new Event('visibilitychange'));

  it('refreshes only a stale snapshot when the tab becomes visible', () => {
    const fixture = TestBed.createComponent(HostComponent);

    lastFetchedAt.set(null);
    fire();
    lastFetchedAt.set(new Date());
    fire();
    visibility = 'hidden';
    lastFetchedAt.set(new Date(Date.now() - 5_000));
    fire();
    expect(refresh).not.toHaveBeenCalled();

    visibility = 'visible';
    fire();
    expect(refresh).toHaveBeenCalledTimes(1);

    fixture.destroy();
    fire();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
