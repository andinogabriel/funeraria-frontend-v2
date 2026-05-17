import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { RouterLink } from '@angular/router';
import { interval } from 'rxjs';

/**
 * Single slide descriptor consumed by the hero carousel. Authoring lives in the page that
 * mounts the carousel (e.g. `dashboard.page.ts`, `home.page.ts`) so a maintainer browsing
 * the page sees the messages inline; this file owns nothing more than the typing.
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
 * Hero carousel with auto-rotate + manual navigation. Slides live on a horizontal track
 * (CSS `transform: translateX(...)`) so the operator can drag the track with the mouse on
 * desktop or with a finger on mobile and watch the slide follow the cursor in real time,
 * snapping to the nearest slide on release. The dots, prev / next chevrons and arrow keys
 * keep working as before — the drag is additive, not a replacement.
 *
 * <h3>Drag mechanics</h3>
 *
 * Pointer Events unify mouse + touch + stylus handling so a single set of handlers covers
 * every input. While a drag is active the auto-rotate pauses, the slide follows the
 * pointer one-for-one, and on release the carousel commits to the nearest slide. Drags
 * shorter than 8 % of the carousel width snap back to the originating slide so an
 * accidental click does not advance the rotation.
 *
 * <h3>Accessibility</h3>
 *
 * - `role="region"` + `aria-roledescription="carousel"` so screen readers announce it as a
 *   carousel rather than a generic group.
 * - Each slide carries `role="group"` + an `aria-label` built from eyebrow + title.
 * - A polite `aria-live` region announces the active slide on every change.
 * - `prefers-reduced-motion: reduce` drops the slide-transition animation entirely.
 */
@Component({
  selector: 'app-hero-carousel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule, RouterLink],
  templateUrl: './hero-carousel.component.html',
  styleUrl: './hero-carousel.component.scss',
})
export class HeroCarouselComponent {
  /** Drag distance (% of carousel width) below which a release snaps back instead of advancing. */
  private static readonly DRAG_COMMIT_THRESHOLD = 0.08;

  /** Slides to cycle through. Must contain at least one entry. */
  readonly slides = input.required<readonly HeroSlide[]>();

  /** Auto-rotate cadence in milliseconds. Set to 0 to disable the timer. */
  readonly autoRotateMs = input<number>(6_000);

  /** Active slide index. Public so the host template can drive transitions. */
  protected readonly activeIndex = signal(0);

  /** Pauses the auto-rotate while hover / focus / drag is held. */
  private readonly paused = signal(false);

  /** Drag offset (px) while a pointer interaction is in flight; 0 otherwise. */
  protected readonly dragOffset = signal(0);

  /** True while the track follows the pointer; suppresses transitions for crisp 1:1 motion. */
  protected readonly dragging = signal(false);

  protected readonly activeSlide = computed(() => this.slides()[this.activeIndex()]);

  protected readonly slideCount = computed(() => this.slides().length);

  /**
   * Inline `transform` for the track. Combines the active-slide offset (`-i * 100%`) with
   * the live drag delta (`+dragPx`) so the slide follows the pointer one-for-one during a
   * drag and snaps to the nearest neighbour on release.
   */
  protected readonly trackTransform = computed(
    () => `translate3d(calc(${-this.activeIndex() * 100}% + ${this.dragOffset()}px), 0, 0)`,
  );

  /** Localised label announced by the polite aria-live region. */
  protected readonly announcement = computed(() => {
    const total = this.slideCount();
    const current = this.activeIndex() + 1;
    const slide = this.activeSlide();
    return `Slide ${current} de ${total}: ${slide.title}`;
  });

  private readonly carouselEl = viewChild.required<ElementRef<HTMLElement>>('carousel');
  private readonly destroyRef = inject(DestroyRef);

  /** Pointer-tracking state for the active drag. `null` when no drag is in flight. */
  private dragStartX: number | null = null;
  private dragPointerId: number | null = null;
  private lastAdvance = 0;

  constructor() {
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

  /* -------------------------------- Pointer drag ----------------------------------------- */

  /**
   * Starts a drag interaction. We capture the pointer so we keep receiving moves even if
   * the cursor leaves the carousel bounds — the slide should follow the finger / cursor
   * the entire way until the release fires. Buttons + dots + the CTA still respond to
   * normal click events because the drag bookkeeping happens on `pointermove` and only
   * commits on `pointerup` after a meaningful delta.
   */
  protected onPointerDown(event: PointerEvent): void {
    // Ignore drags initiated on interactive children (CTA button, dots, chevrons) — those
    // own their click semantics and we don't want a fat-fingered drag to swallow a tap.
    if ((event.target as HTMLElement | null)?.closest('button, a')) {
      return;
    }
    this.dragStartX = event.clientX;
    this.dragPointerId = event.pointerId;
    this.dragging.set(true);
    this.paused.set(true);
    try {
      (event.currentTarget as Element).setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture can throw on synthetic events in tests — safe to ignore.
    }
  }

  protected onPointerMove(event: PointerEvent): void {
    if (this.dragStartX === null || event.pointerId !== this.dragPointerId) {
      return;
    }
    this.dragOffset.set(event.clientX - this.dragStartX);
  }

  protected onPointerUp(event: PointerEvent): void {
    if (this.dragStartX === null || event.pointerId !== this.dragPointerId) {
      return;
    }
    const dx = event.clientX - this.dragStartX;
    const carouselWidth = this.carouselEl().nativeElement.offsetWidth || 1;
    const commitThresholdPx = carouselWidth * HeroCarouselComponent.DRAG_COMMIT_THRESHOLD;

    this.dragStartX = null;
    this.dragPointerId = null;
    this.dragOffset.set(0);
    this.dragging.set(false);
    this.paused.set(false);

    if (Math.abs(dx) < commitThresholdPx) {
      return; // snap back to the originating slide
    }
    if (dx < 0) {
      this.next();
    } else {
      this.prev();
    }
  }

  /** Cancels the drag without committing (e.g. browser navigated away from the pointer). */
  protected onPointerCancel(): void {
    this.dragStartX = null;
    this.dragPointerId = null;
    this.dragOffset.set(0);
    this.dragging.set(false);
    this.paused.set(false);
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
