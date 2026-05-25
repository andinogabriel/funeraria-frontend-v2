import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HeroCarouselComponent, type HeroSlide } from './hero-carousel.component';

const slides: readonly HeroSlide[] = [
  { backgroundUrl: '/dashboard/a.svg', eyebrow: 'A', title: 'Slide A', subtitle: '' },
  { backgroundUrl: '/dashboard/b.svg', eyebrow: 'B', title: 'Slide B', subtitle: '' },
  { backgroundUrl: '/dashboard/c.svg', eyebrow: 'C', title: 'Slide C', subtitle: '' },
];

describe('HeroCarouselComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideZonelessChangeDetection()],
    });
  });

  it('starts on the first slide and exposes a polite a11y announcement', () => {
    const fixture = TestBed.createComponent(HeroCarouselComponent);
    fixture.componentRef.setInput('slides', slides);
    fixture.detectChanges();

    const componentAny = fixture.componentInstance as unknown as {
      activeIndex: () => number;
      announcement: () => string;
    };
    expect(componentAny.activeIndex()).toBe(0);
    expect(componentAny.announcement()).toBe('Slide 1 de 3: Slide A');
  });

  it('next() advances and wraps after the last slide; prev() wraps to the last', () => {
    const fixture = TestBed.createComponent(HeroCarouselComponent);
    fixture.componentRef.setInput('slides', slides);
    fixture.detectChanges();

    const c = fixture.componentInstance as unknown as {
      activeIndex: () => number;
      next: () => void;
      prev: () => void;
      goTo: (n: number) => void;
    };

    c.next();
    expect(c.activeIndex()).toBe(1);
    c.next();
    c.next();
    expect(c.activeIndex()).toBe(0); // wrapped past the end
    c.prev();
    expect(c.activeIndex()).toBe(2); // wrapped back from the start
    c.goTo(1);
    expect(c.activeIndex()).toBe(1);
  });

  it('trackTransform offsets by displayIndex so the front clone is skipped on start', () => {
    const fixture = TestBed.createComponent(HeroCarouselComponent);
    fixture.componentRef.setInput('slides', slides);
    fixture.detectChanges();

    const c = fixture.componentInstance as unknown as {
      goTo: (n: number) => void;
      trackTransform: () => string;
      dragOffset: { set: (value: number) => void };
    };

    // Multi-slide path renders [last_clone, ...slides, first_clone]; the first real
    // slide sits at rendered index 1, so the default transform is -100%.
    expect(c.trackTransform()).toBe('translate3d(calc(-100% + 0px), 0, 0)');
    c.goTo(1);
    expect(c.trackTransform()).toBe('translate3d(calc(-200% + 0px), 0, 0)');
    c.dragOffset.set(-45);
    expect(c.trackTransform()).toBe('translate3d(calc(-200% + -45px), 0, 0)');
  });

  it('renderedSlides pads the array with clones at both ends so the wrap-on-drag never blanks out', () => {
    const fixture = TestBed.createComponent(HeroCarouselComponent);
    fixture.componentRef.setInput('slides', slides);
    fixture.detectChanges();

    const c = fixture.componentInstance as unknown as {
      renderedSlides: () => readonly { title: string }[];
    };

    const rendered = c.renderedSlides();
    expect(rendered).toHaveLength(slides.length + 2);
    // First rendered slide is the clone of the last source slide.
    expect(rendered[0].title).toBe('Slide C');
    // Last rendered slide is the clone of the first source slide.
    expect(rendered[rendered.length - 1].title).toBe('Slide A');
  });

  it('renderedSlides does not pad when there is a single slide (clone trick is unnecessary)', () => {
    const fixture = TestBed.createComponent(HeroCarouselComponent);
    fixture.componentRef.setInput('slides', slides.slice(0, 1));
    fixture.detectChanges();

    const c = fixture.componentInstance as unknown as {
      renderedSlides: () => readonly { title: string }[];
      trackTransform: () => string;
    };

    expect(c.renderedSlides()).toHaveLength(1);
    // Single-slide path keeps displayIndex at 0 so no offset is applied.
    expect(c.trackTransform()).toBe('translate3d(calc(0% + 0px), 0, 0)');
  });
});
