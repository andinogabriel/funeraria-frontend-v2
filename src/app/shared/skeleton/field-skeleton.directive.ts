import { Directive, ElementRef, Renderer2, effect, inject, input } from '@angular/core';

/**
 * Renders a shimmer overlay on top of a host element (typically a
 * {@code <mat-form-field>}) while the data that would populate the field is
 * still in flight from the backend.
 *
 * <h3>Why a directive instead of swapping templates</h3>
 *
 * The form layout has to be stable from the first paint so the operator never
 * sees a layout jump as catalog requests resolve. Re-rendering the field
 * through {@code @if} would unmount the {@code formControlName} binding and
 * trip the registry warnings. Toggling a single CSS class — and rendering the
 * overlay as a sibling div positioned absolutely inside the host — keeps the
 * underlying control mounted, lets validators run as usual, and only blocks
 * pointer interaction while the field has no data to show.
 *
 * <h3>Visual style</h3>
 *
 * The overlay reuses the same gradient + 1.4s ease-in-out shimmer the
 * data-table uses for its first-load skeleton rows, so the loading affordance
 * reads as the same primitive across the app. The host's outline + floating
 * label stay visible — the overlay only covers the input area — so the
 * operator still knows which field is loading.
 *
 * <h3>Usage</h3>
 *
 * <pre>
 *   &lt;mat-form-field [appFieldSkeleton]="!catalogReady()"&gt;
 *     &lt;mat-label&gt;Provincia&lt;/mat-label&gt;
 *     &lt;mat-select formControlName="provinceId"&gt;...&lt;/mat-select&gt;
 *   &lt;/mat-form-field&gt;
 * </pre>
 *
 * Pass {@code false} to suppress the overlay; the directive is a no-op for
 * falsy inputs so consumers can bind directly to a "ready" signal.
 */
@Directive({
  selector: '[appFieldSkeleton]',
  host: {
    '[class.app-field-skeleton]': 'true',
    '[class.app-field-skeleton--loading]': 'appFieldSkeleton()',
    '[attr.aria-busy]': 'appFieldSkeleton() ? "true" : null',
  },
})
export class FieldSkeletonDirective {
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly renderer = inject(Renderer2);

  /**
   * Whether the field is currently loading. {@code true} renders the shimmer
   * overlay and disables pointer interaction; {@code false} removes both.
   */
  readonly appFieldSkeleton = input<boolean>(false);

  private overlay: HTMLElement | null = null;

  constructor() {
    effect(() => {
      if (this.appFieldSkeleton()) {
        this.attachOverlay();
      } else {
        this.detachOverlay();
      }
    });
  }

  private attachOverlay(): void {
    if (this.overlay !== null) {
      return;
    }
    const overlay = this.renderer.createElement('span') as HTMLElement;
    this.renderer.addClass(overlay, 'app-field-skeleton__overlay');
    this.renderer.setAttribute(overlay, 'aria-hidden', 'true');
    this.renderer.appendChild(this.host.nativeElement, overlay);
    this.overlay = overlay;
  }

  private detachOverlay(): void {
    if (this.overlay === null) {
      return;
    }
    this.renderer.removeChild(this.host.nativeElement, this.overlay);
    this.overlay = null;
  }
}
