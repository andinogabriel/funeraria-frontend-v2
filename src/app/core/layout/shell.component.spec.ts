import { TestBed } from '@angular/core/testing';
import type { MatSidenav } from '@angular/material/sidenav';

import {
  ADMIN,
  call,
  configurePage,
  flushAll,
  read,
  render,
  settle,
  textOf,
  USER,
  type PageHarness,
} from '../../../testing/page-harness';
import { ThemeService } from '../theme/theme.service';
import { ShellComponent } from './shell.component';

describe('ShellComponent', () => {
  let h: PageHarness;

  function setup(authorities: readonly string[]) {
    h = configurePage({ authorities });
    const fixture = render(ShellComponent);
    flushAll(h.http, [
      ['/unread-count', { count: 2 }],
      ['/notifications', { content: [] }],
    ]);
    settle(fixture);
    return fixture;
  }

  afterEach(() => {
    for (const req of h.http.match(() => true)) {
      req.flush({ count: 0 });
    }
  });

  it('shows admin-only navigation entries to admins', () => {
    const fixture = setup(ADMIN);
    const labels = (read(fixture, 'navItems') as { label: string }[]).map((i) => i.label);
    expect(labels).toContain('Auditoría');
    expect(labels).toContain('Tarifario');
    expect(textOf(fixture)).toContain('Dashboard');
  });

  it('hides admin-only entries from regular users', () => {
    const fixture = setup(USER);
    const labels = (read(fixture, 'navItems') as { label: string }[]).map((i) => i.label);
    expect(labels).not.toContain('Auditoría');
    expect(labels).toContain('Mis servicios');
  });

  it('toggles the sidenav, tracks its state and closes it on handset', () => {
    const fixture = setup(ADMIN);
    const sidenav = {
      toggle: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
    };
    call(fixture, 'onMenuClick', sidenav as unknown as MatSidenav);
    expect(sidenav.toggle).toHaveBeenCalled();
    call(fixture, 'onOpenedChange', false);
    expect(read(fixture, 'sidenavOpened')).toBe(false);
    call(fixture, 'closeIfHandset', sidenav as unknown as MatSidenav);
  });

  it('switches the theme', () => {
    const fixture = setup(ADMIN);
    const theme = TestBed.inject(ThemeService);
    call(fixture, 'onThemeSelect', 'dark');
    expect(theme.preference()).toBe('dark');
    call(fixture, 'onThemeSelect', 'system');
  });

  it('logs out and returns to the login page', () => {
    const fixture = setup(ADMIN);
    call(fixture, 'onLogout');
    for (const req of h.http.match((r) => r.url.includes('/logout'))) {
      req.flush(null);
    }
    settle(fixture);
    expect(h.navigate).toHaveBeenCalled();
  });
});
