import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  HostListener,
  effect,
  inject,
  input,
  signal,
  untracked,
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
 * Hero carousel with auto-rotate + manual navigation + wrap-on-drag.
 *
 * <h3>Drag mechanics</h3>
 *
 * Pointer Events unify mouse + touch + stylus handling so a single set of handlers covers
 * every input. While a drag is active the auto-rotate pauses, the slide follows the
 * pointer one-for-one, and on release the carousel commits to the nearest slide. Drags
 * shorter than 8 % of the carousel width snap back to the originating slide so an
 * accidental click does not advance the rotation.
 *
 * <h3>Infinite loop trick</h3>
 *
 * The track renders {@code [last_clone, ...slides, first_clone]} when more than one slide
 * is supplied. The {@link displayIndex} signal points at the actual rendered position
 * (real slides live at indices {@code 1..N}; the clones at {@code 0} and {@code N+1} are
 * visually identical to their originals). When a wrap commit happens — e.g. the operator
 * drags right from slide 0 — we animate to the clone position so the drag visual stays
 * continuous, then silently snap {@link displayIndex} back to the matching real position
 * on {@code transitionend}. The snap pixel-matches because the clone and the real slide
 * render the same image, so the operator sees no flash.
 *
 * <h3>Accessibility</h3>
 *
 * - `role="region"` + `aria-roledescription="carousel"` so screen readers announce it as a
 *   carousel rather than a generic group.
 * - Each slide carries `role="group"` + an `aria-label` built from eyebrow + title.
 * - A polite `aria-live` region announces the active slide on every change.
 * - The two clones are `aria-hidden` so screen readers never count them.
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

  /** Active LOGICAL slide index (0 .. slides.length - 1). Public for the announcer. */
  protected readonly activeIndex = signal(0);

  /**
   * Rendered-track display index. For the multi-slide path the track holds
   * {@code [last_clone, ...slides, first_clone]} and the display index ranges
   * {@code 0 .. slides.length + 1}; the default position is {@code activeIndex + 1} so
   * the first real slide is visible. For the single-slide path the clones are skipped
   * and the display index stays at 0.
   */
  protected readonly displayIndex = signal(1);

  /** Pauses the auto-rotate while hover / focus / drag is held. */
  private readonly paused = signal(false);

  /** Drag offset (px) while a pointer interaction is in flight; 0 otherwise. */
  protected readonly dragOffset = signal(0);

  /** True while the track follows the pointer; suppresses transitions for crisp 1:1 motion. */
  protected readonly dragging = signal(false);

  /**
   * Disables the CSS transition for exactly one frame so the post-wrap silent snap from
   * clone to real does not animate (otherwise the track would sweep back across every
   * intermediate slide, visible as a jarring sideways pan).
   */
  protected readonly suppressTransition = signal(false);

  protected readonly activeSlide = computed(() => this.slides()[this.activeIndex()]);

  protected readonly slideCount = computed(() => this.slides().length);

  /**
   * Slides actually rendered on the track. When there's more than one source slide we
   * pad the array with clones at both ends so the operator can drag past either edge
   * and see the wrapped neighbour mid-drag. Single-slide and empty inputs short-circuit.
   */
  protected readonly renderedSlides = computed<readonly HeroSlide[]>(() => {
    const source = this.slides();
    if (source.length <= 1) {
      return source;
    }
    return [source[source.length - 1], ...source, source[0]];
  });

  /**
   * Inline `transform` for the track. Combines the display-slide offset (`-i * 100%`)
   * with the live drag delta (`+dragPx`).
   */
  protected readonly trackTransform = computed(
    () => `translate3d(calc(${-this.displayIndex() * 100}% + ${this.dragOffset()}px), 0, 0)`,
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

  /**
   * True while a wrap commit is animating to the clone position. The next
   * {@code transitionend} on the track silently swaps {@link displayIndex} from the
   * clone back to the matching real slide, then clears this flag.
   */
  private pendingWrapSnap = false;

  constructor() {
    // Seed `displayIndex` from `activeIndex` whenever the slide count changes (typically
    // once at init when the `slides` input is bound). Single-slide path stays at 0 (no
    // clones); multi-slide path offsets by 1 to skip the front clone. `untracked` keeps
    // the effect from re-firing on subsequent `activeIndex` changes — only slideCount
    // should drive a re-seed.
    effect(() => {
      const total = this.slideCount();
      untracked(() => {
        this.displayIndex.set(total <= 1 ? 0 : this.activeIndex() + 1);
      });
    });

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

  /**
   * Moves to the slide at the requested LOGICAL index, wrapping at both ends. Non-drag
   * paths (dots / chevrons / arrow keys / auto-rotate) use this; they jump straight to
   * the real display position without the clone trick because the operator did not
   * initiate any visual continuation.
   */
  protected goTo(index: number): void {
    const total = this.slideCount();
    if (total === 0) {
      return;
    }
    const next = ((index % total) + total) % total;
    this.activeIndex.set(next);
    // Single-slide path skips the clones, so display stays at 0; multi-slide path
    // offsets by 1 to skip the front clone.
    this.displayIndex.set(total <= 1 ? 0 : next + 1);
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
    this.dragging.set(false);
    this.paused.set(false);

    // Drag too short to count as a swipe — clear the offset and let the transition snap
    // back to the originating slide.
    if (Math.abs(dx) < commitThresholdPx) {
      this.dragOffset.set(0);
      return;
    }

    const total = this.slideCount();
    if (total <= 1) {
      // Nothing to wrap to.
      this.dragOffset.set(0);
      return;
    }

    const oldIdx = this.activeIndex();
    const wantsNext = dx < 0;
    const newIdx = wantsNext ? (oldIdx + 1) % total : (oldIdx - 1 + total) % total;
    const isWrap = wantsNext ? oldIdx === total - 1 : oldIdx === 0;

    if (!isWrap) {
      // Normal commit — just move to the new real position. The CSS transition animates
      // the track one slide width over.
      this.activeIndex.set(newIdx);
      this.displayIndex.set(newIdx + 1);
      this.dragOffset.set(0);
      this.lastAdvance = Date.now();
      return;
    }

    // Wrap commit — animate to the CLONE position (continuation of the drag direction)
    // so the user perceives the slide they were swiping toward landing into view. After
    // the transition completes, silently snap to the matching real position (clones look
    // identical to the originals so the swap is invisible).
    const clonePosition = wantsNext ? total + 1 : 0;
    this.activeIndex.set(newIdx);
    this.displayIndex.set(clonePosition);
    this.dragOffset.set(0);
    this.pendingWrapSnap = true;
    this.lastAdvance = Date.now();
  }

  /** Cancels the drag without committing (e.g. browser navigated away from the pointer). */
  protected onPointerCancel(): void {
    this.dragStartX = null;
    this.dragPointerId = null;
    this.dragOffset.set(0);
    this.dragging.set(false);
    this.paused.set(false);
  }

  /**
   * Fires after every track transition completes. Used exclusively to perform the
   * silent clone → real swap when a wrap drag has just animated into a clone position.
   */
  protected onTrackTransitionEnd(): void {
    if (!this.pendingWrapSnap) {
      return;
    }
    this.pendingWrapSnap = false;
    // Suppress the transition for one frame, jump to the matching real slide, then
    // re-enable transitions on the following frame. The jump pixel-matches the clone
    // so the operator sees no flash.
    this.suppressTransition.set(true);
    this.displayIndex.set(this.activeIndex() + 1);
    if (typeof window !== 'undefined') {
      window.requestAnimationFrame(() => {
        // Touching offsetHeight forces a layout flush so the no-transition transform is
        // committed before we re-enable transitions on the next frame.
        void this.carouselEl().nativeElement.offsetHeight;
        window.requestAnimationFrame(() => this.suppressTransition.set(false));
      });
    } else {
      this.suppressTransition.set(false);
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
