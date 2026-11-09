import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { MatDialogRef } from '@angular/material/dialog';

import { affiliate } from '../../../testing/fixtures';
import {
  ADMIN,
  configurePage,
  render,
  settle,
  textOf,
  USER,
  type PageHarness,
} from '../../../testing/page-harness';
import { ThemeService } from '../theme/theme.service';
import {
  CommandPaletteComponent,
  PALETTE_REMOTE_LIMIT,
  PALETTE_SEARCH_DEBOUNCE_MS,
} from './command-palette.component';

const ROSA = {
  holder: { id: 7, dni: 20111222, firstName: 'Rosa', lastName: 'Gomez', phone: null, email: null },
  activeAffiliates: 2,
  monthlyTotal: 4000,
};

const isAffiliateSearch = (r: { url: string }) => r.url.endsWith('/affiliates/search');
const isHolderSearch = (r: { url: string }) => r.url.endsWith('/membership/holders');

describe('CommandPaletteComponent', () => {
  let h: PageHarness;
  const close = vi.fn();

  function setup(authorities: readonly string[] = ADMIN) {
    close.mockClear();
    h = configurePage({
      authorities,
      providers: [{ provide: MatDialogRef, useValue: { close } }],
    });
    return render(CommandPaletteComponent);
  }

  const input = (f: ComponentFixture<CommandPaletteComponent>) =>
    f.nativeElement.querySelector('[data-testid="palette-input"]') as HTMLInputElement;
  const options = (f: ComponentFixture<CommandPaletteComponent>) =>
    Array.from(f.nativeElement.querySelectorAll('[data-testid="palette-option"]')) as HTMLElement[];
  const labels = (f: ComponentFixture<CommandPaletteComponent>) =>
    options(f).map((o) => o.querySelector('.palette-option-label')?.textContent?.trim());

  function type(f: ComponentFixture<CommandPaletteComponent>, value: string) {
    const el = input(f);
    el.value = value;
    el.dispatchEvent(new Event('input'));
    settle(f);
  }

  function press(f: ComponentFixture<CommandPaletteComponent>, key: string) {
    const event = new KeyboardEvent('keydown', { key, cancelable: true });
    input(f).dispatchEvent(event);
    settle(f);
    return event;
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.useRealTimers();
    h.http.verify();
  });

  it('lists navigation, create and theme commands for an admin, grouped', () => {
    const fixture = setup();
    const text = textOf(fixture);
    expect(text).toContain('Ir a');
    expect(text).toContain('Crear');
    expect(text).toContain('Tema');
    expect(labels(fixture)).toContain('Auditoría');
    expect(labels(fixture)).toContain('Nuevo ingreso');
    expect(options(fixture)[0].getAttribute('aria-selected')).toBe('true');
    expect(input(fixture).getAttribute('aria-activedescendant')).toBe('palette-option-0');
  });

  it('focuses the search box on the first render', () => {
    const fixture = setup();
    expect(document.activeElement).toBe(input(fixture));
  });

  it('hides admin-only commands from a regular user', () => {
    const fixture = setup(USER);
    expect(labels(fixture)).not.toContain('Auditoría');
    expect(labels(fixture)).not.toContain('Nuevo ingreso');
    expect(labels(fixture)).toContain('Mis servicios');
    expect(labels(fixture)).toContain('Nuevo servicio');
  });

  it('filters commands ignoring accents and case, by label or keyword', () => {
    const fixture = setup();
    type(fixture, 'CATEGORIA');
    expect(labels(fixture)).toEqual(['Categorías', 'Nueva categoría']);

    type(fixture, 'alta');
    expect(labels(fixture).every((l) => l?.startsWith('Nuev'))).toBe(true);
    vi.advanceTimersByTime(PALETTE_SEARCH_DEBOUNCE_MS);
    h.http.expectOne(isAffiliateSearch).flush([]);
    h.http.expectOne(isHolderSearch).flush([]);
  });

  it('moves the active row with the arrows, wrapping at both ends', () => {
    const fixture = setup();
    const count = options(fixture).length;

    const down = press(fixture, 'ArrowDown');
    expect(down.defaultPrevented).toBe(true);
    expect(input(fixture).getAttribute('aria-activedescendant')).toBe('palette-option-1');

    press(fixture, 'ArrowUp');
    press(fixture, 'ArrowUp');
    expect(input(fixture).getAttribute('aria-activedescendant')).toBe(
      `palette-option-${count - 1}`,
    );

    press(fixture, 'ArrowDown');
    expect(input(fixture).getAttribute('aria-activedescendant')).toBe('palette-option-0');

    options(fixture)[3].dispatchEvent(new MouseEvent('mousemove'));
    settle(fixture);
    expect(options(fixture)[3].getAttribute('aria-selected')).toBe('true');

    // Other keys are left to the input.
    expect(press(fixture, 'a').defaultPrevented).toBe(false);
  });

  it('runs the active command on Enter and closes the dialog', () => {
    const fixture = setup();
    press(fixture, 'ArrowDown');
    press(fixture, 'Enter');
    expect(close).toHaveBeenCalled();
    expect(h.router.navigateByUrl).toHaveBeenCalledWith('/afiliados');
  });

  it('runs a command on click, including a theme switch', () => {
    const fixture = setup();
    const theme = TestBed.inject(ThemeService);
    type(fixture, 'oscuro');
    options(fixture)[0].click();
    expect(theme.preference()).toBe('dark');
    expect(close).toHaveBeenCalled();
    theme.setPreference('auto');
  });

  it('searches affiliates and holders on the backend after the debounce', () => {
    const fixture = setup();
    type(fixture, ' gomez ');
    expect(textOf(fixture)).toContain('Sin resultados');
    vi.advanceTimersByTime(PALETTE_SEARCH_DEBOUNCE_MS);
    settle(fixture);
    expect(textOf(fixture)).not.toContain('Sin resultados');

    const affiliates = h.http.expectOne(isAffiliateSearch);
    expect(affiliates.request.params.get('value')).toBe('gomez');
    const many = Array.from({ length: PALETTE_REMOTE_LIMIT + 2 }, (_, i) =>
      affiliate({ dni: 40_000_000 + i }),
    );
    affiliates.flush([affiliate({ deceased: true }), ...many]);
    h.http.expectOne(isHolderSearch).flush([ROSA]);
    settle(fixture);

    expect(textOf(fixture)).toContain('Afiliados');
    expect(textOf(fixture)).toContain('Titulares');
    expect(textOf(fixture)).toContain('DNI 40111222 · Fallecido');
    expect(labels(fixture).filter((l) => l === 'Gomez, Ana').length).toBe(PALETTE_REMOTE_LIMIT);

    options(fixture)[0].click();
    expect(h.navigate).toHaveBeenCalledWith(['/afiliados'], { queryParams: { dni: 40111222 } });

    const holderRow = options(fixture).find((o) => o.textContent?.includes('Gomez, Rosa'));
    holderRow?.click();
    expect(h.navigate).toHaveBeenCalledWith(['/titulares', 20111222]);
  });

  it('skips the holder search for a regular user and survives backend failures', () => {
    const fixture = setup(USER);
    type(fixture, 'perez');
    vi.advanceTimersByTime(PALETTE_SEARCH_DEBOUNCE_MS);
    h.http.expectNone(isHolderSearch);
    h.http.expectOne(isAffiliateSearch).flush(null, { status: 500, statusText: 'Error' });
    settle(fixture);
    expect(fixture.nativeElement.querySelector('[data-testid="palette-empty"]')).not.toBeNull();
    expect(press(fixture, 'ArrowDown').defaultPrevented).toBe(true);
    press(fixture, 'Enter');
    expect(close).not.toHaveBeenCalled();
  });

  it('drops stale backend results when the term gets too short', () => {
    const fixture = setup();
    type(fixture, 'go');
    vi.advanceTimersByTime(PALETTE_SEARCH_DEBOUNCE_MS);
    h.http.expectOne(isAffiliateSearch).flush([affiliate()]);
    h.http.expectOne(isHolderSearch).flush(null, { status: 500, statusText: 'Error' });
    settle(fixture);
    expect(labels(fixture)).toContain('Gomez, Ana');

    type(fixture, 'g');
    vi.advanceTimersByTime(PALETTE_SEARCH_DEBOUNCE_MS);
    settle(fixture);
    expect(labels(fixture)).not.toContain('Gomez, Ana');
  });
});
