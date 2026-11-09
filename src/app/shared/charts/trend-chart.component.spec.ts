import { Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import {
  formatCompact,
  monthLabel,
  niceScale,
  TrendChartComponent,
  type TrendChartKind,
  type TrendSeries,
} from './trend-chart.component';

@Component({
  imports: [TrendChartComponent],
  template: `<app-trend-chart
    label="Prueba"
    [kind]="kind()"
    [months]="months()"
    [series]="series()"
    [format]="format"
  />`,
})
class HostComponent {
  readonly kind = signal<TrendChartKind>('line');
  readonly months = signal<readonly string[]>(['2026-09', '2026-10', '2026-11']);
  readonly series = signal<readonly TrendSeries[]>([
    { name: 'Emitidas', slot: 1, values: [100, 200, 300] },
    { name: 'Cobradas', slot: 2, values: [50, 0, 250] },
  ]);
  readonly format = (v: number) => `$${v}`;
}

describe('TrendChartComponent', () => {
  let fixture: ComponentFixture<HostComponent>;

  function setup(configure?: (host: HostComponent) => void) {
    fixture = TestBed.createComponent(HostComponent);
    configure?.(fixture.componentInstance);
    fixture.detectChanges();
    TestBed.tick();
    fixture.detectChanges();
    return fixture;
  }

  const q = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;
  const all = (selector: string) =>
    Array.from(fixture.nativeElement.querySelectorAll(selector)) as HTMLElement[];
  const plot = () => q('[data-testid="chart-plot"]');
  const key = (k: string) => {
    const event = new KeyboardEvent('keydown', { key: k, cancelable: true });
    plot().dispatchEvent(event);
    fixture.detectChanges();
    return event;
  };

  it('draws one line per series with a legend and month labels', () => {
    setup();
    expect(all('[data-testid="chart-line"]').length).toBe(2);
    expect(q('.trend-chart__legend').textContent).toContain('Emitidas');
    expect(q('.trend-chart__legend').textContent).toContain('Cobradas');
    expect(plot().textContent).toContain('sept 2026');
    expect(plot().textContent).toContain('nov');
    expect(plot().getAttribute('aria-label')).toContain('Prueba');
  });

  it('draws bars for a single series, with no legend', () => {
    setup((host) => {
      host.kind.set('bar');
      host.series.set([{ name: 'Servicios', slot: 1, values: [3, 0, 5] }]);
    });
    // The zero month has no bar shape.
    const paths = all('[data-testid="chart-bar"]').map((b) => b.getAttribute('d'));
    expect(paths.length).toBe(3);
    expect(paths.filter((d) => d).length).toBe(2);
    expect(q('.trend-chart__legend')).toBeNull();
  });

  it('walks the months with the keyboard and shows every value in the tooltip', () => {
    setup();
    expect(q('[data-testid="chart-tooltip"]')).toBeNull();

    expect(key('ArrowRight').defaultPrevented).toBe(true);
    expect(q('[data-testid="chart-tooltip"]').textContent).toContain('septiembre 2026');
    expect(q('[data-testid="chart-tooltip"]').textContent).toContain('$100');

    key('ArrowRight');
    key('End');
    expect(q('[data-testid="chart-tooltip"]').textContent).toContain('noviembre 2026');
    expect(q('[data-testid="chart-tooltip"]').textContent).toContain('$250');
    expect(all('.trend-chart__dot').length).toBe(2);
    expect(q('.trend-chart__tooltip--left')).not.toBeNull();

    key('ArrowRight');
    key('Home');
    key('ArrowLeft');
    expect(q('[data-testid="chart-tooltip"]').textContent).toContain('septiembre');

    expect(key('a').defaultPrevented).toBe(false);
    key('Escape');
    expect(q('[data-testid="chart-tooltip"]')).toBeNull();

    key('ArrowLeft');
    expect(q('[data-testid="chart-tooltip"]').textContent).toContain('noviembre');
    plot().dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(q('[data-testid="chart-tooltip"]')).toBeNull();
  });

  it('follows the pointer to the nearest month and hides on leave', () => {
    setup();
    vi.spyOn(plot(), 'getBoundingClientRect').mockReturnValue({ left: 0 } as DOMRect);
    plot().dispatchEvent(new MouseEvent('pointermove', { clientX: 9999 }));
    fixture.detectChanges();
    expect(q('[data-testid="chart-tooltip"]').textContent).toContain('noviembre');
    plot().dispatchEvent(new MouseEvent('pointermove', { clientX: 0 }));
    fixture.detectChanges();
    expect(q('[data-testid="chart-tooltip"]').textContent).toContain('septiembre');
    plot().dispatchEvent(new MouseEvent('pointerleave'));
    fixture.detectChanges();
    expect(q('[data-testid="chart-tooltip"]')).toBeNull();
  });

  it('swaps the plot for a table with the same numbers', () => {
    setup();
    q('[data-testid="chart-table-toggle"]').click();
    fixture.detectChanges();
    const table = q('[data-testid="chart-table"]');
    expect(table.textContent).toContain('octubre 2026');
    expect(table.textContent).toContain('$200');
    expect(plot()).toBeNull();
    q('[data-testid="chart-table-toggle"]').click();
    fixture.detectChanges();
    expect(plot()).not.toBeNull();
  });

  it('ignores the keyboard without months', () => {
    setup((host) => {
      host.months.set([]);
      host.series.set([{ name: 'Servicios', slot: 1, values: [] }]);
    });
    expect(key('ArrowRight').defaultPrevented).toBe(false);
  });
});

describe('chart helpers', () => {
  it('rounds the axis up to a 1/2/2.5/5 step with four ticks', () => {
    expect(niceScale(0)).toEqual({ max: 4, step: 1 });
    expect(niceScale(3)).toEqual({ max: 3, step: 1 });
    expect(niceScale(37)).toEqual({ max: 40, step: 10 });
    expect(niceScale(1_234_567)).toEqual({ max: 1_500_000, step: 500_000 });
    expect(niceScale(9.9)).toEqual({ max: 10, step: 2.5 });
  });

  it('formats compact axis labels and month names', () => {
    expect(formatCompact(1_500_000)).toMatch(/1,5\s?M/);
    expect(monthLabel('2026-11', false)).toBe('nov');
    expect(monthLabel('2027-01', false)).toBe('ene 2027');
    expect(monthLabel('2026-11', true, 'long')).toBe('noviembre 2026');
  });
});
