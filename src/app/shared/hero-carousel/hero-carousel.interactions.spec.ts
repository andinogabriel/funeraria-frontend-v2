import { provideRouter } from '@angular/router';
import { TestBed, type ComponentFixture } from '@angular/core/testing';

import { call, read } from '../../../testing/page-harness';
import { HeroCarouselComponent, type HeroSlide } from './hero-carousel.component';

const slide = (title: string): HeroSlide => ({
  backgroundUrl: `/img/${title}.jpg`,
  eyebrow: 'Funeraria',
  title,
  subtitle: `${title} subtitle`,
});

function pointer(clientX: number, pointerId = 1): PointerEvent {
  const target = document.createElement('div');
  return {
    clientX,
    pointerId,
    target,
    currentTarget: { setPointerCapture: () => undefined },
  } as unknown as PointerEvent;
}

describe('HeroCarouselComponent interactions', () => {
  let fixture: ComponentFixture<HeroCarouselComponent>;

  function setup(slides: readonly HeroSlide[], autoRotateMs = 0) {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    fixture = TestBed.createComponent(HeroCarouselComponent);
    fixture.componentRef.setInput('slides', slides);
    fixture.componentRef.setInput('autoRotateMs', autoRotateMs);
    fixture.detectChanges();
    TestBed.tick();
    return fixture;
  }

  afterEach(() => vi.useRealTimers());

  it('navigates with next / prev / goTo and wraps at both ends', () => {
    setup([slide('A'), slide('B'), slide('C')]);
    expect(fixture.nativeElement.textContent).toContain('A');
    call(fixture, 'next');
    expect(read(fixture, 'activeIndex')).toBe(1);
    call(fixture, 'prev');
    call(fixture, 'prev');
    expect(read(fixture, 'activeIndex')).toBe(2);
    call(fixture, 'goTo', 4);
    expect(read(fixture, 'activeIndex')).toBe(1);
    expect(read(fixture, 'announcement')).toBeTruthy();
  });

  it('responds to the arrow keys', () => {
    setup([slide('A'), slide('B')]);
    fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(read(fixture, 'activeIndex')).toBe(1);
    fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(read(fixture, 'activeIndex')).toBe(0);
    fixture.nativeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(read(fixture, 'activeIndex')).toBe(0);
  });

  it('auto-rotates unless paused by hover or focus', () => {
    vi.useFakeTimers();
    setup([slide('A'), slide('B'), slide('C')], 500);
    call(fixture, 'onMouseEnter');
    vi.advanceTimersByTime(1_000);
    expect(read(fixture, 'activeIndex')).toBe(0);
    call(fixture, 'onMouseLeave');
    call(fixture, 'onFocus');
    call(fixture, 'onBlur');
    vi.advanceTimersByTime(1_000);
    expect(read(fixture, 'activeIndex')).not.toBe(0);
  });

  it('commits a swipe, snaps back a short drag and ignores foreign pointers', () => {
    setup([slide('A'), slide('B'), slide('C')]);
    call(fixture, 'onPointerDown', pointer(500));
    call(fixture, 'onPointerMove', pointer(300));
    expect(read(fixture, 'dragOffset')).toBe(-200);
    call(fixture, 'onPointerMove', pointer(100, 2));
    call(fixture, 'onPointerUp', pointer(100, 2));
    call(fixture, 'onPointerUp', pointer(300));
    expect(read(fixture, 'activeIndex')).toBe(1);

    call(fixture, 'onPointerDown', pointer(500));
    call(fixture, 'onPointerUp', pointer(500));
    expect(read(fixture, 'activeIndex')).toBe(1);

    call(fixture, 'onPointerDown', pointer(500));
    call(fixture, 'onPointerCancel');
    expect(read(fixture, 'dragging')).toBe(false);
  });

  it('wraps with the clone trick and snaps back after the transition', () => {
    setup([slide('A'), slide('B')]);
    call(fixture, 'onPointerDown', pointer(100));
    call(fixture, 'onPointerUp', pointer(400));
    expect(read(fixture, 'activeIndex')).toBe(1);
    expect(read(fixture, 'displayIndex')).toBe(0);
    call(fixture, 'onTrackTransitionEnd');
    expect(read(fixture, 'displayIndex')).toBe(2);
    call(fixture, 'onTrackTransitionEnd');

    call(fixture, 'onPointerDown', pointer(400));
    call(fixture, 'onPointerUp', pointer(100));
    expect(read(fixture, 'activeIndex')).toBe(0);
  });

  it('ignores drags that start on a button and swipes on a single slide', () => {
    setup([slide('A')]);
    const button = document.createElement('button');
    call(fixture, 'onPointerDown', { ...pointer(0), target: button } as unknown as PointerEvent);
    expect(read(fixture, 'dragging')).toBe(false);
    call(fixture, 'onPointerDown', pointer(500));
    call(fixture, 'onPointerUp', pointer(100));
    expect(read(fixture, 'activeIndex')).toBe(0);
  });
});
