import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { KpiTileComponent } from './kpi-tile.component';

describe('KpiTileComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection()],
    });
  });

  it('falls back to "—" when value is null', () => {
    const fixture = TestBed.createComponent(KpiTileComponent);
    fixture.componentRef.setInput('icon', 'group');
    fixture.componentRef.setInput('label', 'Afiliados');
    fixture.componentRef.setInput('value', null);
    fixture.detectChanges();

    const c = fixture.componentInstance as unknown as { displayValue: () => string };
    expect(c.displayValue()).toBe('—');
  });

  it('computes the sparkline polyline points from a normalised array', () => {
    const fixture = TestBed.createComponent(KpiTileComponent);
    fixture.componentRef.setInput('icon', 'group');
    fixture.componentRef.setInput('label', 'Afiliados');
    fixture.componentRef.setInput('sparkline', [0, 0.5, 1]);
    fixture.detectChanges();

    const c = fixture.componentInstance as unknown as { sparkPoints: () => string };
    // viewBox 60x24: x at 0/30/60, y at 24/12/0 (1 - normalised).
    expect(c.sparkPoints()).toBe('0.00,24.00 30.00,12.00 60.00,0.00');
  });

  it('hides the trend pill when trend is null or 0', () => {
    const fixture = TestBed.createComponent(KpiTileComponent);
    fixture.componentRef.setInput('icon', 'group');
    fixture.componentRef.setInput('label', 'Afiliados');
    fixture.componentRef.setInput('trend', null);
    fixture.detectChanges();
    const c = fixture.componentInstance as unknown as { trendPill: () => unknown };
    expect(c.trendPill()).toBeNull();

    fixture.componentRef.setInput('trend', 0);
    fixture.detectChanges();
    expect(c.trendPill()).toBeNull();
  });

  it('renders a positive trend pill with the up-arrow sign', () => {
    const fixture = TestBed.createComponent(KpiTileComponent);
    fixture.componentRef.setInput('icon', 'group');
    fixture.componentRef.setInput('label', 'Afiliados');
    fixture.componentRef.setInput('trend', 12);
    fixture.detectChanges();
    const c = fixture.componentInstance as unknown as {
      trendPill: () => { sign: string; label: string; positive: boolean } | null;
    };
    const pill = c.trendPill();
    expect(pill?.sign).toBe('↑');
    expect(pill?.label).toBe('12%');
    expect(pill?.positive).toBe(true);
  });

  function tile(inputs: Record<string, unknown>) {
    const fixture = TestBed.createComponent(KpiTileComponent);
    fixture.componentRef.setInput('icon', 'group');
    fixture.componentRef.setInput('label', 'Afiliados');
    for (const [key, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(key, value);
    }
    fixture.detectChanges();
    return fixture.componentInstance as unknown as {
      selectedRangeLabel: () => string | null;
      onActivate: () => void;
      onKeydown: (e: KeyboardEvent) => void;
      tileClick: { subscribe: (fn: () => void) => void };
    };
  }

  it('labels the active range, falling back to the first option or none', () => {
    const ranges = [
      { value: 'MONTH', label: 'Mes' },
      { value: 'YEAR', label: 'Año' },
    ];
    expect(tile({}).selectedRangeLabel()).toBeNull();
    expect(tile({ ranges, selectedRange: 'YEAR' }).selectedRangeLabel()).toBe('Año');
    expect(tile({ ranges, selectedRange: 'NOPE' }).selectedRangeLabel()).toBe('Mes');
  });

  it('emits clicks and Enter / Space only when interactive', () => {
    const clicks = vi.fn();
    const passive = tile({});
    passive.tileClick.subscribe(clicks);
    passive.onActivate();
    passive.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(clicks).not.toHaveBeenCalled();

    const active = tile({ interactive: true });
    active.tileClick.subscribe(clicks);
    active.onActivate();
    active.onKeydown(new KeyboardEvent('keydown', { key: 'Enter' }));
    active.onKeydown(new KeyboardEvent('keydown', { key: ' ' }));
    active.onKeydown(new KeyboardEvent('keydown', { key: 'Tab' }));
    expect(clicks).toHaveBeenCalledTimes(3);
  });
});
