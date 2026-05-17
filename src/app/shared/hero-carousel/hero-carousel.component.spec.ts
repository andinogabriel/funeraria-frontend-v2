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
});
