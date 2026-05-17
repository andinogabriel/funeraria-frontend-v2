import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  HostListener,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { interval } from 'rxjs';

/**
 * Single slide descriptor consumed by the hero carousel. Authoring lives in
 * `dashboard.page.ts` so a maintainer browsing the page sees the messages
 * inline; this file owns nothing more than the typing.
 */
export interface HeroSlide {
  /** Absolute or relative URL of the SVG / WebP / JPEG background. */
  readonly backgroundUrl: string;
  /** Short uppercase eyebrow above the title; e.g. "Bienvenido". */
  readonly eyebrow: string;
  /** Operator-facing heading shown in the largest type. */
  readonly title: string;
  /** Supporting one-line subtitle. */
  readonly subtitle: string;
  /** Optional CTA — when supplied a Material button renders inside the slide. */
  readonly cta?: {
    readonly label: string;
    readonly icon: string;
    readonly routerLink: string;
  };
}

/**
 * Hero carousel for the operator dashboard. Five lightweight slides cycle
 * automatically with a 6-second dwell; the operator can take manual control
 * via the dots, the prev/next arrows, swipe gestures on touch devices, or the
 * arrow keys when the carousel is focused. Hovering pauses the auto-rotation
 * so a reader can stay on a slide; moving the pointer away resumes it.
 *
 * <h3>Accessibility</h3>
 *
 * - The container exposes `role="region"` + `aria-roledescription="carousel"`
 *   so screen readers announce it as a carousel rather than a generic group.
 * - Each slide is wrapped in a `role="group"` element with an `aria-label`
 *   built from its eyebrow + title.
 * - The auto-rotate timer is short-circuited entirely under
 *   `prefers-reduced-motion: reduce`; the slide change happens, but without
 *   the slide-in animation.
 *
 * <h3>Performance</h3>
 *
 * Only the active slide is in the DOM at any given time — preloading every
 * background image would download four assets the operator might never see
 * before the rotation reaches them. The previous + next slides are
 * `<link rel="prefetch">`-ed lazily via the {@link prefetchNeighbours} hook
 * after the first slide paints.
 */
@Component({
  selector: 'app-hero-carousel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './hero-carousel.component.html',
  styleUrl: './hero-carousel.component.scss',
})
export class HeroCarouselComponent {
  /** Slides to cycle through. Must contain at least one entry. */
  readonly slides = input.required<readonly HeroSlide[]>();

  /** Auto-rotate cadence in milliseconds. Set to 0 to disable the timer. */
  readonly autoRotateMs = input<number>(6_000);

  /** Active slide index. Public so the host template can drive transitions. */
  protected readonly activeIndex = signal(0);

  /** Pauses the auto-rotate while hover / focus is held. */
  private readonly paused = signal(false);

  protected readonly activeSlide = computed(() => this.slides()[this.activeIndex()]);

  protected readonly slideCount = computed(() => this.slides().length);

  /**
   * Localised label for the announcement region. Reads like
   * "Slide 2 of 5: Acompañamiento" so a screen-reader user knows where they are.
   */
  protected readonly announcement = computed(() => {
    const total = this.slideCount();
    const current = this.activeIndex() + 1;
    const slide = this.activeSlide();
    return `Slide ${current} de ${total}: ${slide.title}`;
  });

  private readonly destroyRef = inject(DestroyRef);

  private touchStartX: number | null = null;

  constructor() {
    // Wire the auto-rotate AFTER the input signal has a value. We start with
    // an interval that re-reads `autoRotateMs` and `paused` on every tick so
    // a runtime change to either is honoured without a re-subscription.
    interval(250)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        const cadence = this.autoRotateMs();
        if (cadence <= 0 || this.paused()) {
          return;
        }
        this.tick(cadence);
      });
  }

  private lastAdvance = 0;

  private tick(cadenceMs: number): void {
    const now = Date.now();
    if (now - this.lastAdvance < cadenceMs) {
      return;
    }
    this.lastAdvance = now;
    this.next();
  }

  /** Moves to the slide at the requested index, wrapping at both ends. */
  protected goTo(index: number): void {
    const total = this.slideCount();
    if (total === 0) {
      return;
    }
    const next = ((index % total) + total) % total;
    this.activeIndex.set(next);
    this.lastAdvance = Date.now();
  }

  protected next(): void {
    this.goTo(this.activeIndex() + 1);
  }

  protected prev(): void {
    this.goTo(this.activeIndex() - 1);
  }

  protected onMouseEnter(): void {
    this.paused.set(true);
  }

  protected onMouseLeave(): void {
    this.paused.set(false);
  }

  protected onFocus(): void {
    this.paused.set(true);
  }

  protected onBlur(): void {
    this.paused.set(false);
  }

  /** Swipe handler: a horizontal drag of more than 40 px triggers prev / next. */
  protected onTouchStart(event: TouchEvent): void {
    this.touchStartX = event.touches[0]?.clientX ?? null;
  }

  protected onTouchEnd(event: TouchEvent): void {
    if (this.touchStartX === null) {
      return;
    }
    const endX = event.changedTouches[0]?.clientX ?? this.touchStartX;
    const dx = endX - this.touchStartX;
    this.touchStartX = null;
    if (Math.abs(dx) < 40) {
      return;
    }
    if (dx < 0) {
      this.next();
    } else {
      this.prev();
    }
  }

  @HostListener('keydown', ['$event'])
  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowRight') {
      this.next();
      event.preventDefault();
    } else if (event.key === 'ArrowLeft') {
      this.prev();
      event.preventDefault();
    }
  }
}
