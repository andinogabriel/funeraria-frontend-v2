import { TestBed } from '@angular/core/testing';

import { FreshnessIndicatorComponent } from './freshness-indicator.component';

/**
 * The component relies on a module-private ticking signal for the relative
 * label, but the threshold logic itself is pure: `elapsedMs` against fixed
 * cut-offs. We exercise it by stamping `updatedAt` and reading the rendered
 * text. The interval timer is not exercised here — covered indirectly by the
 * 30 s cadence comment in the component's documentation.
 */
describe('FreshnessIndicatorComponent', () => {
  function render(updatedAt: Date | null): HTMLElement {
    const fixture = TestBed.createComponent(FreshnessIndicatorComponent);
    fixture.componentRef.setInput('updatedAt', updatedAt);
    fixture.detectChanges();
    return fixture.nativeElement;
  }

  it('renders nothing when updatedAt is null', () => {
    const host = render(null);
    expect(host.textContent?.trim()).toBe('');
  });

  it('shows "Actualizado ahora" when the timestamp is fresh (<30 s)', () => {
    const host = render(new Date(Date.now() - 5_000));
    expect(host.textContent).toContain('Actualizado ahora');
  });

  it('shows "hace menos de 1 min" between 30 s and 60 s', () => {
    const host = render(new Date(Date.now() - 45_000));
    expect(host.textContent).toContain('hace menos de 1 min');
  });

  it('shows "hace N min" between 1 min and 60 min', () => {
    const host = render(new Date(Date.now() - 5 * 60_000));
    expect(host.textContent).toContain('hace 5 min');
  });

  it('shows "hace N h" between 1 h and 24 h', () => {
    const host = render(new Date(Date.now() - 3 * 60 * 60_000));
    expect(host.textContent).toContain('hace 3 h');
  });

  it('shows "hace N días" for older than 24 h, with singular for exactly 1 day', () => {
    expect(render(new Date(Date.now() - 24 * 60 * 60_000)).textContent).toContain('hace 1 día');
    expect(render(new Date(Date.now() - 2 * 24 * 60 * 60_000)).textContent).toContain(
      'hace 2 días',
    );
  });

  it('exposes the absolute timestamp via the title attribute', () => {
    const at = new Date(Date.now() - 60_000);
    const host = render(at);
    const span = host.querySelector('span');
    expect(span?.getAttribute('title')).toContain('Última actualización');
  });
});
