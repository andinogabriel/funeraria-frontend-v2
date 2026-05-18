import { TestBed } from '@angular/core/testing';

import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  beforeEach(() => {
    localStorage.removeItem('funeraria.theme');
    document.documentElement.classList.remove('theme-light', 'theme-dark');
    TestBed.configureTestingModule({});
  });

  it('defaults to auto when nothing is stored and leaves the <html> class untouched', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.preference()).toBe('auto');
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false);
  });

  it('persists an explicit preference and writes the matching class on <html>', () => {
    const service = TestBed.inject(ThemeService);
    service.setPreference('dark');
    TestBed.tick();
    expect(localStorage.getItem('funeraria.theme')).toBe('dark');
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
  });

  it('strips the override classes when the user returns to auto', () => {
    const service = TestBed.inject(ThemeService);
    service.setPreference('light');
    TestBed.tick();
    expect(document.documentElement.classList.contains('theme-light')).toBe(true);

    service.setPreference('auto');
    TestBed.tick();
    expect(document.documentElement.classList.contains('theme-light')).toBe(false);
    expect(document.documentElement.classList.contains('theme-dark')).toBe(false);
    expect(localStorage.getItem('funeraria.theme')).toBeNull();
  });

  it('restores a previously stored preference on construction', () => {
    localStorage.setItem('funeraria.theme', 'dark');
    const service = TestBed.inject(ThemeService);
    expect(service.preference()).toBe('dark');
    TestBed.tick();
    expect(document.documentElement.classList.contains('theme-dark')).toBe(true);
  });

  it('ignores garbage stored in localStorage and falls back to auto', () => {
    localStorage.setItem('funeraria.theme', 'neon');
    const service = TestBed.inject(ThemeService);
    expect(service.preference()).toBe('auto');
  });
});
